<?php

namespace App\Services;

use App\Models\AdministrativeAction;
use App\Models\User;
use App\Mail\AccountPasswordChangedMail;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class AdminUserService
{
    public function update(User $actor, int $id, array $values): User
    {
        try {
            return $this->change($actor, $id, function (User $target, $admins) use ($actor, $values): void {
                $emailChanged = array_key_exists('email', $values) && $values['email'] !== $target->email;
                if ($emailChanged && $target->role === User::ROLE_ADMIN && $target->hasVerifiedEmail()
                    && $target->account_status === User::STATUS_ACTIVE && $this->activeAdminCount($admins) <= 1) {
                    $this->conflict('The last verified active administrator cannot change email.');
                }
                if ($emailChanged) Password::broker()->deleteToken($target);
                foreach ($values as $field => $value) $target->{$field} = $value;
                if (! $target->isDirty(['username', 'email'])) return;
                if ($emailChanged) $target->email_verified_at = null;
                $target->save();
                if ($emailChanged) {
                    // A link issued to the previous address must never activate the new address.
                    $target->accountInvitations()->delete();
                    $this->revokeSessions($target);
                }
                $this->audit($actor, $target, 'user.updated', null, [
                    'username_changed' => $target->wasChanged('username'), 'email_changed' => $emailChanged,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            $errors = [];
            if (isset($values['username']) && User::query()->where('username', $values['username'])->whereKeyNot($id)->exists()) {
                $errors['username'] = ['The username has already been taken.'];
            }
            if (isset($values['email']) && User::query()->where('email', $values['email'])->whereKeyNot($id)->exists()) {
                $errors['email'] = ['The email has already been taken.'];
            }
            throw ValidationException::withMessages($errors ?: ['account' => ['Username or email is already in use.']]);
        }
    }

    public function role(User $actor, int $id, string $role, ?string $reason): User
    {
        return $this->change($actor, $id, function (User $target) use ($actor, $role, $reason): void {
            if ($target->id === $actor->id || $target->role === User::ROLE_ADMIN) $this->conflict('Administrator roles cannot be changed here.');
            if ($target->role === $role) return;
            $old = $target->role;
            $target->role = $role;
            $target->save();
            $this->revokeSessions($target);
            $this->audit($actor, $target, 'user.role_changed', $reason, ['from' => $old, 'to' => $role]);
        });
    }

    public function status(User $actor, int $id, string $status, ?string $reason): User
    {
        return $this->change($actor, $id, function (User $target, $admins) use ($actor, $status, $reason): void {
            if ($target->id === $actor->id && $status !== User::STATUS_ACTIVE) $this->conflict('You cannot change your own account to this status.');
            if ($target->account_status === $status) return;
            if ($target->role === User::ROLE_ADMIN && $target->hasVerifiedEmail()
                && $target->account_status === User::STATUS_ACTIVE && $status !== User::STATUS_ACTIVE
                && $this->activeAdminCount($admins) <= 1) $this->conflict('The last verified active administrator must remain active.');
            $old = $target->account_status;
            $target->account_status = $status;
            $target->save();
            $this->revokeSessions($target);
            $this->audit($actor, $target, 'user.status_changed', $reason, ['from' => $old, 'to' => $status]);
        });
    }

    public function password(User $actor, int $id, string $adminPassword, string $password, ?string $reason): void
    {
        $target = $this->change($actor, $id, function (User $target, $admins) use ($actor, $adminPassword, $password, $reason): void {
            $this->assertPasswordTarget($actor, $target);
            $current = $admins->firstWhere('id', $actor->id);
            if (! is_string($current->password) || $current->password === '' || ! Hash::check($adminPassword, $current->password)) {
                throw ValidationException::withMessages(['admin_current_password' => ['Your administrator password is incorrect.']]);
            }
            $target->password = $password;
            $target->password_session_version = Str::random(64);
            $target->setRememberToken(Str::random(60));
            $target->save();
            Password::broker()->deleteToken($target);
            $this->revokeSessions($target);
            $this->audit($actor, $target, 'user.password_changed', $reason, []);
        });

        try {
            Mail::to($target->email)->send(new AccountPasswordChangedMail($target->username));
        } catch (Throwable) {
            Log::warning('Administrator password change notification failed.', ['target_id' => $target->id]);
        }
    }

    public function initiatePasswordReset(User $actor, int $id, ?string $reason): string
    {
        $token = '';
        $target = $this->change($actor, $id, function (User $target) use ($actor, $reason, &$token): void {
            $this->assertPasswordTarget($actor, $target);
            if (Password::broker()->getRepository()->recentlyCreatedToken($target)) {
                throw new HttpResponseException(response()->json(['message' => 'A reset link was requested recently. Please wait before trying again.'], 429)
                    ->header('Cache-Control', 'no-store, private'));
            }
            $token = Password::broker()->createToken($target);
            $this->audit($actor, $target, 'user.password_reset_initiated', $reason, []);
        });

        $mailer = config('mail.default');
        $members = in_array($mailer, ['failover', 'roundrobin'], true)
            ? config("mail.mailers.{$mailer}.mailers", []) : [];
        if ($mailer === 'log' || in_array('log', $members, true)) return 'pending';
        try {
            $target->sendPasswordResetNotification($token);
            return 'accepted';
        } catch (Throwable) {
            Log::warning('Administrator password reset notification failed.', ['target_id' => $target->id]);
            return 'pending';
        }
    }

    private function assertPasswordTarget(User $actor, User $target): void
    {
        if ($target->id === $actor->id || $target->role === User::ROLE_ADMIN || $target->invitation_pending) {
            $this->conflict('Password management is unavailable for this account.');
        }
    }

    private function change(User $actor, int $id, callable $operation): User
    {
        return DB::transaction(function () use ($actor, $id, $operation): User {
            // The (account_status, role, id) index bounds the active-admin lock set.
            // Lock it in ID order before the target to serialize last-admin decisions.
            $admins = User::query()->where('account_status', User::STATUS_ACTIVE)
                ->where('role', User::ROLE_ADMIN)->orderBy('id')->lockForUpdate()->get();
            $current = $admins->firstWhere('id', $actor->id);
            if (! $current || ! $current->canWriteCommunity() || ! $current->hasVerifiedEmail()) {
                throw new HttpResponseException(response()->json(['message' => 'You do not have permission to perform this action.', 'code' => 'FORBIDDEN'], 403)
                    ->header('Cache-Control', 'no-store, private'));
            }
            $target = $admins->firstWhere('id', $id) ?? User::query()->whereKey($id)->lockForUpdate()->first();
            if (! $target) abort(404);
            $operation($target, $admins);
            return $target->fresh();
        }, 3);
    }

    private function activeAdminCount($admins): int
    {
        return $admins->filter(fn (User $admin) => $admin->account_status === User::STATUS_ACTIVE && $admin->hasVerifiedEmail())->count();
    }

    private function revokeSessions(User $target): void
    {
        // The default database session store uses the Core connection. Other
        // drivers still receive fresh role/state checks on each protected request.
        if (config('session.driver') === 'database'
            && (config('session.connection') === null || config('session.connection') === config('database.default'))) {
            DB::table(config('session.table', 'sessions'))->where('user_id', $target->id)->delete();
        }
    }

    private function audit(User $actor, User $target, string $action, ?string $reason, array $details): void
    {
        AdministrativeAction::query()->create([
            'actor_id' => $actor->id, 'action' => $action, 'target_type' => 'user', 'target_id' => $target->id,
            'reason' => $reason, 'details' => $details, 'created_at' => now(),
        ]);
    }

    private function conflict(string $message): never
    {
        throw new HttpResponseException(response()->json(['message' => $message, 'code' => 'STATE_CONFLICT'], 409)
            ->header('Cache-Control', 'no-store, private'));
    }
}
