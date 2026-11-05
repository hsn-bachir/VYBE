<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordResetService
{
    public function reset(array $values): void
    {
        DB::transaction(function () use ($values): void {
            $target = User::query()->where('email', $values['email'])->lockForUpdate()->first();
            if (! $target || $target->role === User::ROLE_ADMIN || $target->invitation_pending) $this->invalid();

            $status = Password::broker()->reset($values, function (User $user, string $password) use ($target): void {
                if ($user->id !== $target->id) $this->invalid();
                $target->password = $password;
                $target->password_session_version = Str::random(64);
                $target->setRememberToken(Str::random(60));
                $target->save();
                if (config('session.driver') === 'database'
                    && (config('session.connection') === null || config('session.connection') === config('database.default'))) {
                    DB::table(config('session.table', 'sessions'))->where('user_id', $target->id)->delete();
                }
            });
            if ($status !== Password::PASSWORD_RESET) $this->invalid();
        }, 3);
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['token' => ['This password reset link is invalid or expired.']]);
    }
}
