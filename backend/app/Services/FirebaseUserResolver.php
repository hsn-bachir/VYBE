<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FirebaseUserResolver
{
    public function existingOrPending(FirebaseIdentity $identity): ?User
    {
        $existing = User::query()->where('firebase_uid', $identity->uid)->first();
        if ($existing) {
            return $this->syncExisting($existing, $identity);
        }
        if (User::query()->where('email', $identity->email)->exists()) {
            $this->conflict();
        }

        return null;
    }

    public function resolve(FirebaseIdentity $identity): User
    {
        $existing = User::query()->where('firebase_uid', $identity->uid)->first();
        if ($existing) {
            return $this->syncExisting($existing, $identity);
        }

        if (User::query()->where('email', $identity->email)->exists()) {
            $this->conflict();
        }

        // Stable candidates let a concurrent request converge on the same UID.
        $prefix = preg_replace('/[^a-z0-9_]/', '_', Str::lower(strstr($identity->email, '@', true))) ?: 'user';
        $prefix = trim(substr($prefix, 0, 16), '_') ?: 'user';
        $prefix = strlen($prefix) < 3 ? str_pad($prefix, 3, '_') : $prefix;
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $username = substr($prefix, 0, 16).'_'.substr(hash('sha256', $identity->uid.':'.$attempt), 0, 10);
            try {
                $user = new User(['username' => $username, 'email' => $identity->email]);
                $user->firebase_uid = $identity->uid;
                $user->password = null;
                if ($identity->emailVerified) {
                    $user->email_verified_at = now();
                }
                $user->save();

                return $user;
            } catch (UniqueConstraintViolationException) {
                $existing = User::query()->where('firebase_uid', $identity->uid)->first();
                if ($existing) {
                    return $this->syncExisting($existing, $identity);
                }
                if (User::query()->where('email', $identity->email)->exists()) {
                    $this->conflict();
                }
            }
        }

        $this->conflict();
    }

    public function register(FirebaseIdentity $identity, string $username): User
    {
        $existing = User::query()->where('firebase_uid', $identity->uid)->first();
        if ($existing) {
            return $this->syncExisting($existing, $identity);
        }
        if (User::query()->where('email', $identity->email)->exists()) {
            $this->conflict();
        }

        try {
            $user = new User(['username' => $username, 'email' => $identity->email]);
            $user->firebase_uid = $identity->uid;
            $user->password = null;
            if ($identity->emailVerified) {
                $user->email_verified_at = now();
            }
            $user->save();

            return $user;
        } catch (UniqueConstraintViolationException) {
            $existing = User::query()->where('firebase_uid', $identity->uid)->first();
            if ($existing) {
                return $this->syncExisting($existing, $identity);
            }
            if (User::query()->where('email', $identity->email)->exists()) {
                $this->conflict();
            }
            throw ValidationException::withMessages(['username' => ['The username has already been taken.']]);
        }
    }

    private function syncExisting(User $user, FirebaseIdentity $identity): User
    {
        if ($user->invitation_pending) {
            throw new HttpResponseException(response()->json([
                'message' => 'Complete your account invitation before signing in.',
                'code' => 'INVITATION_PENDING',
            ], 403)->header('Cache-Control', 'no-store, private'));
        }
        try {
            $result = DB::transaction(function () use ($user, $identity): ?User {
                $current = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
                if ($current->firebase_uid !== $identity->uid) {
                    $this->conflict();
                }
                if ($current->email !== $identity->email) {
                    if (User::query()->where('email', $identity->email)->whereKeyNot($current->id)->exists()) {
                        $current->email_verified_at = null;
                        $current->password_session_version = Str::random(64);
                        $current->save();

                        return null;
                    }
                    $current->email = $identity->email;
                    $current->email_verified_at = null;
                    $current->password_session_version = Str::random(64);
                }
                if ($identity->emailVerified && ! $current->hasVerifiedEmail()) {
                    $current->email_verified_at = now();
                } elseif (! $identity->emailVerified && $current->hasVerifiedEmail()) {
                    $current->email_verified_at = null;
                }
                if ($current->isDirty()) {
                    $current->save();
                }

                return $current;
            }, 3);
            if (! $result) {
                $this->conflict();
            }

            return $result;
        } catch (UniqueConstraintViolationException) {
            DB::transaction(function () use ($user): void {
                $current = User::query()->whereKey($user->id)->lockForUpdate()->first();
                if ($current) {
                    $current->email_verified_at = null;
                    $current->password_session_version = Str::random(64);
                    $current->save();
                }
            }, 3);
            $this->conflict();
        }
    }

    private function conflict(): never
    {
        throw new HttpResponseException(response()->json([
            'message' => 'This Firebase identity conflicts with an existing VYBE account. Contact support to link the accounts.',
            'code' => 'IDENTITY_CONFLICT',
        ], 409)->header('Cache-Control', 'no-store, private'));
    }
}
