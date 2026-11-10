<?php

namespace App\Services;

use App\Mail\AccountInvitationMail;
use App\Models\AccountInvitation;
use App\Models\AdministrativeAction;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class AccountInvitationService
{
    /** @return array{user: User, delivery: string} */
    public function create(User $actor, array $values): array
    {
        if (config('firebase_auth.mode') === 'firebase') {
            return $this->createFirebase($actor, $values);
        }
        try {
            [$user, $token] = DB::transaction(function () use ($actor, $values): array {
                $this->assertLiveAdmin($actor);
                $user = User::query()->create([
                    'username' => $values['username'],
                    'email' => $values['email'],
                    'password' => Str::random(64),
                ]);
                $user->invitation_pending = true;
                $user->save();
                $token = $this->issue($user);
                $this->audit($actor, $user, 'user.created');

                return [$user->fresh(), $token];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            $errors = [];
            if (User::query()->where('username', $values['username'])->exists()) {
                $errors['username'] = ['The username has already been taken.'];
            }
            if (User::query()->where('email', $values['email'])->exists()) {
                $errors['email'] = ['The email has already been taken.'];
            }
            throw ValidationException::withMessages($errors ?: ['account' => ['Username or email is already in use.']]);
        }

        return ['user' => $user, 'delivery' => $this->deliver($user, $token)];
    }

    /** @return array{user: User, delivery: string} */
    public function resend(User $actor, int $id): array
    {
        if (config('firebase_auth.mode') === 'firebase') {
            return $this->resendFirebase($actor, $id);
        }
        [$user, $token] = DB::transaction(function () use ($actor, $id): array {
            $admins = $this->assertLiveAdmin($actor);
            $user = $admins->firstWhere('id', $id) ?? User::query()->whereKey($id)->lockForUpdate()->first();
            if (! $user || ! $user->invitation_pending || $user->hasVerifiedEmail()
                || $user->account_status !== User::STATUS_ACTIVE || $user->role !== User::ROLE_USER) {
                abort(404);
            }
            $token = $this->issue($user);
            $this->audit($actor, $user, 'user.invitation_resent');

            return [$user->fresh(), $token];
        }, 3);

        return ['user' => $user, 'delivery' => $this->deliver($user, $token)];
    }

    public function accept(string $email, string $token, string $password): void
    {
        $hash = hash('sha256', $token);
        $candidate = AccountInvitation::query()->where('token_hash', $hash)->first();
        if (! $candidate) {
            $this->invalid();
        }

        DB::transaction(function () use ($candidate, $email, $hash, $password): void {
            $user = User::query()->whereKey($candidate->user_id)->lockForUpdate()->first();
            if (! $user) {
                $this->invalid();
            }
            $invitation = AccountInvitation::query()->where('user_id', $user->id)->lockForUpdate()->first();
            if (! $invitation || ! hash_equals($invitation->token_hash, $hash)
                || $invitation->email !== $email || $user->email !== $email
                || $invitation->expires_at->isPast() || ! $user->invitation_pending
                || $user->hasVerifiedEmail() || $user->account_status !== User::STATUS_ACTIVE
                || $user->role !== User::ROLE_USER) {
                $this->invalid();
            }
            $user->password = $password;
            $user->email_verified_at = now();
            $user->invitation_pending = false;
            $user->save();
            $invitation->delete();
        }, 3);
    }

    public function acceptFirebase(string $email, string $token, ?string $password, ?string $idToken): void
    {
        $hash = hash('sha256', $token);
        $candidate = AccountInvitation::query()->where('token_hash', $hash)->first();
        if (! $candidate) {
            $this->invalid();
        }
        try {
            DB::transaction(function () use ($candidate, $email, $hash, $password, $idToken): void {
                $user = User::query()->whereKey($candidate->user_id)->lockForUpdate()->first();
                $invitation = $user ? AccountInvitation::query()->where('user_id', $user->id)->lockForUpdate()->first() : null;
                if (! $user || ! $invitation || ! hash_equals($invitation->token_hash, $hash)
                    || $invitation->email !== $email || $user->email !== $email
                    || $invitation->expires_at->isPast() || ! $user->invitation_pending
                    || $user->account_status !== User::STATUS_ACTIVE
                    || ! in_array($user->role, [User::ROLE_USER, User::ROLE_MODERATOR], true)) {
                    $this->invalid();
                }
                // Mailbox proof comes from the delivered one-use token. For an
                // existing identity, require a second, fresh Firebase sign-in proof.
                if ($user->firebase_uid === null) {
                    if (! $idToken || $password !== null) {
                        $this->invalid();
                    }
                    $identity = app(FirebaseAuthentication::class)->verify($idToken);
                    if ($identity->email !== $email || User::query()->where('firebase_uid', $identity->uid)->exists()) {
                        $this->invalid();
                    }
                    app(FirebaseAdminIdentityService::class)->verifyExistingInvitationIdentity($identity->uid, $email);
                    $user->firebase_uid = $identity->uid;
                } else {
                    if ($password === null || $idToken !== null) {
                        $this->invalid();
                    }
                    // Retry is safe if Firebase succeeded and this SQL transaction failed.
                    app(FirebaseAdminIdentityService::class)->setInvitationPassword($user, $password);
                }
                $user->password = null;
                $user->email_verified_at = now();
                $user->invitation_pending = false;
                $user->save();
                $invitation->delete();
            }, 3);
        } catch (UniqueConstraintViolationException) {
            app(FirebaseAdminIdentityService::class)->error(409, 'This Firebase identity is already linked to another VYBE account.', 'IDENTITY_CONFLICT');
        }
    }

    private function createFirebase(User $actor, array $values): array
    {
        DB::transaction(fn () => $this->assertLiveAdmin($actor), 3);
        $firebase = app(FirebaseAdminIdentityService::class);
        $existing = $firebase->lookupEmail($values['email']);
        if ($existing && ($existing->disabled || User::query()->where('firebase_uid', $existing->uid)->exists())) {
            $firebase->error(409, 'This Firebase identity already belongs to a VYBE account.', 'IDENTITY_CONFLICT');
        }
        try {
            $user = DB::transaction(function () use ($actor, $values, $existing): User {
                $this->assertLiveAdmin($actor);
                $user = new User(['username' => $values['username'], 'email' => $values['email']]);
                $user->password = null;
                $user->firebase_uid = $existing ? null : 'vybe-invite-'.Str::uuid();
                $user->role = $values['role'] ?? User::ROLE_USER;
                $user->invitation_pending = true;
                $user->save();

                return $user;
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['account' => ['Username or email is already in use.']]);
        }

        return $this->finishFirebaseInvitation($actor, $user);
    }

    private function resendFirebase(User $actor, int $id): array
    {
        $user = DB::transaction(function () use ($actor, $id): User {
            $admins = $this->assertLiveAdmin($actor);
            $user = $admins->firstWhere('id', $id) ?? User::query()->whereKey($id)->lockForUpdate()->first();
            if (! $user || ! $user->invitation_pending || $user->hasVerifiedEmail()
                || $user->account_status !== User::STATUS_ACTIVE
                || ! in_array($user->role, [User::ROLE_USER, User::ROLE_MODERATOR], true)) {
                abort(404);
            }

            return $user;
        }, 3);

        return $this->finishFirebaseInvitation($actor, $user, true);
    }

    private function finishFirebaseInvitation(User $actor, User $user, bool $resend = false): array
    {
        if ($user->firebase_uid === null) {
            $existing = app(FirebaseAdminIdentityService::class)->lookupEmail($user->email);
            if (! $existing || $existing->disabled || User::query()->where('firebase_uid', $existing->uid)->exists()) {
                app(FirebaseAdminIdentityService::class)->error(409, 'The existing Firebase identity requires reconciliation.', 'IDENTITY_CONFLICT');
            }
        } else {
            app(FirebaseAdminIdentityService::class)->provision($user->firebase_uid, $user->email);
        }
        [$user, $token] = DB::transaction(function () use ($actor, $user, $resend): array {
            $this->assertLiveAdmin($actor);
            $current = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            if (! $current->invitation_pending || $current->email !== $user->email) {
                app(FirebaseAdminIdentityService::class)->error(409, 'The invitation account changed. Refresh and retry.', 'STATE_CONFLICT');
            }
            $token = $this->issue($current);
            if ($resend && ! AdministrativeAction::query()->where('target_type', 'user')
                ->where('target_id', $current->id)->where('action', 'user.created')->exists()) {
                $this->audit($actor, $current, 'user.created', ['role' => $current->role]);
            }
            $this->audit($actor, $current, $resend ? 'user.invitation_resent' : 'user.created',
                $resend ? [] : ['role' => $current->role]);

            return [$current->fresh(), $token];
        }, 3);

        return ['user' => $user, 'delivery' => $this->deliver($user, $token)];
    }

    private function issue(User $user): string
    {
        $token = bin2hex(random_bytes(32));
        AccountInvitation::query()->updateOrCreate(['user_id' => $user->id], [
            'email' => $user->email,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addMinutes(config('invitations.expires_minutes')),
        ]);

        return $token;
    }

    private function deliver(User $user, string $token): string
    {
        $mailer = config('mail.default');
        $members = in_array($mailer, ['failover', 'roundrobin'], true)
            ? config("mail.mailers.{$mailer}.mailers", []) : [];
        // Laravel's log transport writes the complete message, including the setup link.
        if ($mailer === 'log' || in_array('log', $members, true)) {
            return 'pending';
        }
        try {
            Mail::to($user->email)->send(new AccountInvitationMail($user->username, $user->email, $token,
                config('firebase_auth.mode') === 'firebase' && $user->firebase_uid === null));

            return 'accepted'; // Transport accepted the message; inbox delivery is not guaranteed.
        } catch (Throwable) {
            return 'pending'; // Account and token persist so an administrator can resend.
        }
    }

    private function assertLiveAdmin(User $actor)
    {
        $admins = User::query()->where('account_status', User::STATUS_ACTIVE)
            ->where('role', User::ROLE_ADMIN)->orderBy('id')->lockForUpdate()->get();
        $current = $admins->firstWhere('id', $actor->id);
        if (! $current || ! $current->hasVerifiedEmail()) {
            throw new HttpResponseException(response()->json([
                'message' => 'You do not have permission to perform this action.', 'code' => 'FORBIDDEN',
            ], 403)->header('Cache-Control', 'no-store, private'));
        }

        return $admins;
    }

    private function audit(User $actor, User $target, string $action, array $details = []): void
    {
        AdministrativeAction::query()->create([
            'actor_id' => $actor->id, 'action' => $action, 'target_type' => 'user',
            'target_id' => $target->id, 'reason' => null, 'details' => $details, 'created_at' => now(),
        ]);
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['invitation' => ['This invitation is invalid or expired.']]);
    }
}
