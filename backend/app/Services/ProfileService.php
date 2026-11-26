<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProfileService
{
    public function publicProfile(int $id): User
    {
        return User::query()->select(['id', 'username', 'avatar_url'])
            ->whereKey($id)
            ->whereIn('account_status', [User::STATUS_ACTIVE, User::STATUS_RESTRICTED])
            ->whereNotNull('email_verified_at')
            ->where('invitation_pending', false)
            ->first() ?? abort(404, 'Not found.');
    }

    public function read(User $user): User
    {
        return $user->fresh()->loadCount(['watchedMovies', 'watchlistEntries', 'reviews']);
    }

    public function update(User $user, array $values): User
    {
        try {
            DB::transaction(function () use ($user, $values): void {
                $current = AccountAccess::lock($user);
                if (array_key_exists('username', $values)) {
                    $current->username = $values['username'];
                }
                if (array_key_exists('bio', $values)) {
                    $current->bio = $values['bio'];
                }
                $current->save();
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['username' => ['The username has already been taken.']]);
        }

        return $this->read($user);
    }
}
