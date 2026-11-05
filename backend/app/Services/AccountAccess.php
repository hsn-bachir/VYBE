<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;

class AccountAccess
{
    public static function lock(User $user, bool $community = false): User
    {
        $current = User::query()->whereKey($user->getKey())->lockForUpdate()->first();
        if (! $current || ! $current->canAccessAccount()) {
            throw new HttpResponseException(response()->json([
                'message' => 'This account cannot access VYBE.',
                'code' => $current?->account_status === User::STATUS_BANNED ? 'ACCOUNT_BANNED' : 'ACCOUNT_DEACTIVATED',
            ], 403)->header('Cache-Control', 'no-store, private'));
        }
        if ($community && ! $current->canWriteCommunity()) {
            throw new HttpResponseException(response()->json([
                'message' => 'This account cannot perform this action.', 'code' => 'ACCOUNT_RESTRICTED',
            ], 403)->header('Cache-Control', 'no-store, private'));
        }

        return $current;
    }
}
