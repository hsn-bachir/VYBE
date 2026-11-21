<?php

namespace App\Services;

use App\Mail\AccountPasswordChangedMail;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Throwable;

class FirebaseAdminUserService
{
    public function __construct(private FirebaseAdminIdentityService $identity) {}

    public function methods(User $actor, int $id): array
    {
        return $this->withTarget($actor, $id, function (User $target): array {
            $record = $this->identity->record($target);

            return $this->identity->methods($record);
        });
    }

    public function password(User $actor, int $id, string $token, string $password, ?string $reason): void
    {
        $this->identity->confirm($actor, $token);
        $target = $this->withTarget($actor, $id, function (User $target) use ($actor, $reason): User {
            $this->assertPasswordTarget($actor, $target);
            $record = $this->identity->record($target);
            if (! in_array('password', $this->identity->methods($record), true)) {
                $this->identity->error(409, 'This account has no email/password sign-in method.', 'PASSWORD_PROVIDER_UNAVAILABLE');
            }
            // Revoke VYBE sessions before the remote change. If Firebase fails,
            // the user must sign in again, but an old VYBE session cannot survive success.
            $this->identity->revokeLocalSessions($target);
            $this->identity->audit($actor, $target, 'user.password_change_requested', $reason);

            return $target->fresh();
        });
        $this->identity->setPassword($target, $password);
        DB::transaction(fn () => $this->identity->audit($actor, $target, 'user.password_changed', $reason), 3);
        try {
            Mail::to($target->email)->send(new AccountPasswordChangedMail($target->username));
        } catch (Throwable) {
            Log::warning('Administrator password change notification failed.', ['target_id' => $target->id]);
        }
    }

    public function reset(User $actor, int $id, ?string $reason): string
    {
        $target = $this->withTarget($actor, $id, function (User $target) use ($actor, $reason): User {
            $this->assertPasswordTarget($actor, $target);
            $record = $this->identity->record($target);
            if (! in_array('password', $this->identity->methods($record), true)) {
                $this->identity->error(409, 'This account has no email/password sign-in method.', 'PASSWORD_PROVIDER_UNAVAILABLE');
            }
            $this->identity->audit($actor, $target, 'user.password_reset_initiated', $reason);

            return $target;
        });
        try {
            $this->identity->sendPasswordReset($target);
        } catch (HttpResponseException $e) {
            DB::transaction(fn () => $this->identity->audit($actor, $target, 'user.password_reset_delivery_failed', $reason), 3);
            throw $e;
        }

        return 'accepted'; // Firebase accepted the email request; inbox delivery is not guaranteed.
    }

    public function email(User $actor, int $id, string $token, string $email, ?string $username = null): User
    {
        $this->identity->confirm($actor, $token);
        try {
            $target = $this->withTarget($actor, $id, function (User $target, $admins) use ($actor, $email): User {
                $emailChanged = $target->email !== $email;
                if ($emailChanged && $target->role === User::ROLE_ADMIN && $target->hasVerifiedEmail()
                    && $target->account_status === User::STATUS_ACTIVE
                    && $admins->filter(fn (User $admin) => $admin->hasVerifiedEmail())->count() <= 1) {
                    $this->identity->error(409, 'The last verified active administrator cannot change email.', 'STATE_CONFLICT');
                }
                if ($emailChanged && User::query()->where('email', $email)->whereKeyNot($target->id)->exists()) {
                    throw ValidationException::withMessages(['email' => ['The email has already been taken.']]);
                }
                $this->identity->revokeLocalSessions($target);
                $this->identity->audit($actor, $target, 'user.email_change_requested');

                return $target->fresh();
            });
            // A remote success cannot leave an old VYBE session valid, even if
            // the final SQL write fails. A new confirmation can retry safely.
            $this->identity->setEmail($target, $email);

            return $this->withTarget($actor, $id, function (User $target) use ($actor, $email, $username): User {
                $owner = $this->identity->lookupEmail($email);
                if (! $owner || $owner->uid !== $target->firebase_uid) {
                    $this->identity->error(409, 'The Firebase email does not match this account.', 'IDENTITY_CONFLICT');
                }
                if (User::query()->where('email', $email)->whereKeyNot($target->id)->exists()) {
                    throw ValidationException::withMessages(['email' => ['The email has already been taken.']]);
                }
                if ($username !== null) {
                    $target->username = $username;
                }
                $target->email = $email;
                $target->email_verified_at = null;
                $target->save();
                $target->accountInvitations()->delete();
                $this->identity->audit($actor, $target, 'user.updated', null,
                    ['username_changed' => $username !== null && $target->wasChanged('username'), 'email_changed' => true]);

                return $target->fresh();
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => ['The email has already been taken.']]);
        }
    }

    private function assertPasswordTarget(User $actor, User $target): void
    {
        if ($target->id === $actor->id || $target->role === User::ROLE_ADMIN || $target->invitation_pending) {
            $this->identity->error(409, 'Password management is unavailable for this account.', 'STATE_CONFLICT');
        }
    }

    private function withTarget(User $actor, int $id, callable $operation): mixed
    {
        return DB::transaction(function () use ($actor, $id, $operation): mixed {
            $admins = User::query()->where('account_status', User::STATUS_ACTIVE)
                ->where('role', User::ROLE_ADMIN)->orderBy('id')->lockForUpdate()->get();
            $current = $admins->firstWhere('id', $actor->id);
            if (! $current || ! $current->hasVerifiedEmail()) {
                $this->identity->error(403, 'You do not have permission to perform this action.', 'FORBIDDEN');
            }
            $target = $admins->firstWhere('id', $id) ?? User::query()->whereKey($id)->lockForUpdate()->first();
            if (! $target) {
                abort(404);
            }

            return $operation($target, $admins);
        }, 3);
    }
}
