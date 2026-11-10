<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Kreait\Firebase\Contract\Auth;
use Throwable;

class LinkFirebaseUser extends Command
{
    protected $signature = 'vybe:firebase-link {user_id : Existing local user ID} {firebase_uid : Verified Firebase UID}';

    protected $description = 'Explicitly link a verified Firebase identity to an existing VYBE user';

    public function handle(): int
    {
        $id = filter_var($this->argument('user_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $uid = (string) $this->argument('firebase_uid');
        if (! $id || $uid === '' || strlen($uid) > 128) {
            $this->error('Provide a valid local user ID and Firebase UID.');

            return self::FAILURE;
        }

        try {
            $firebase = app(Auth::class);
            $record = $firebase->getUser($uid);
        } catch (Throwable $e) {
            $this->error('Firebase identity lookup failed ('.get_class($e).').');

            return self::FAILURE;
        }
        if ($record->disabled || ! $record->emailVerified || ! is_string($record->email)) {
            $this->error('The Firebase identity must have an enabled, verified email.');

            return self::FAILURE;
        }

        try {
            $linked = DB::transaction(function () use ($id, $uid, $record): bool {
                $user = User::query()->whereKey($id)->lockForUpdate()->first();
                if (! $user || $user->firebase_uid !== null
                    || User::query()->where('firebase_uid', $uid)->exists()
                    || $user->email !== Str::lower(trim($record->email))) {
                    return false;
                }
                $user->firebase_uid = $uid;
                $user->email_verified_at = now();
                $user->password_session_version = Str::random(64);
                $user->save();

                return true;
            }, 3);
        } catch (Throwable $e) {
            $this->error('Local identity linking failed ('.get_class($e).').');

            return self::FAILURE;
        }
        if (! $linked) {
            $this->error('The account is absent, already linked, or its email differs from the verified Firebase email.');

            return self::FAILURE;
        }

        $this->info('Linked local account '.$id.'; previous Laravel sessions are invalidated.');

        return self::SUCCESS;
    }
}
