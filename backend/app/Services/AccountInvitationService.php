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
            if (User::query()->where('username', $values['username'])->exists()) $errors['username'] = ['The username has already been taken.'];
            if (User::query()->where('email', $values['email'])->exists()) $errors['email'] = ['The email has already been taken.'];
            throw ValidationException::withMessages($errors ?: ['account' => ['Username or email is already in use.']]);
        }

        return ['user' => $user, 'delivery' => $this->deliver($user, $token)];
    }

    /** @return array{user: User, delivery: string} */
    public function resend(User $actor, int $id): array
    {
        [$user, $token] = DB::transaction(function () use ($actor, $id): array {
            $admins = $this->assertLiveAdmin($actor);
            $user = $admins->firstWhere('id', $id) ?? User::query()->whereKey($id)->lockForUpdate()->first();
            if (! $user || ! $user->invitation_pending || $user->hasVerifiedEmail()
                || $user->account_status !== User::STATUS_ACTIVE || $user->role !== User::ROLE_USER) abort(404);
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
        if (! $candidate) $this->invalid();

        DB::transaction(function () use ($candidate, $email, $hash, $password): void {
            $user = User::query()->whereKey($candidate->user_id)->lockForUpdate()->first();
            if (! $user) $this->invalid();
            $invitation = AccountInvitation::query()->where('user_id', $user->id)->lockForUpdate()->first();
            if (! $invitation || ! hash_equals($invitation->token_hash, $hash)
                || $invitation->email !== $email || $user->email !== $email
                || $invitation->expires_at->isPast() || ! $user->invitation_pending
                || $user->hasVerifiedEmail() || $user->account_status !== User::STATUS_ACTIVE
                || $user->role !== User::ROLE_USER) $this->invalid();
            $user->password = $password;
            $user->email_verified_at = now();
            $user->invitation_pending = false;
            $user->save();
            $invitation->delete();
        }, 3);
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
        if ($mailer === 'log' || in_array('log', $members, true)) return 'pending';
        try {
            Mail::to($user->email)->send(new AccountInvitationMail($user->username, $user->email, $token));
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

    private function audit(User $actor, User $target, string $action): void
    {
        AdministrativeAction::query()->create([
            'actor_id' => $actor->id, 'action' => $action, 'target_type' => 'user',
            'target_id' => $target->id, 'reason' => null, 'details' => [], 'created_at' => now(),
        ]);
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['invitation' => ['This invitation is invalid or expired.']]);
    }
}
