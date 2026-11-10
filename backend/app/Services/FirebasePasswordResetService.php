<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\EmailNotFound;
use Kreait\Firebase\Exception\Auth\ExpiredOobCode;
use Kreait\Firebase\Exception\Auth\InvalidOobCode;
use Kreait\Firebase\Exception\Auth\UserNotFound;
use Throwable;

class FirebasePasswordResetService
{
    public function __construct(private Auth $firebase, private FirebaseIdentityMethods $identityMethods) {}

    public function reset(string $code, string $password): string
    {
        try {
            $email = $this->firebase->verifyPasswordResetCode($code);
            $record = $this->firebase->getUserByEmail($email);
        } catch (ExpiredOobCode|InvalidOobCode|EmailNotFound|UserNotFound) {
            $this->invalid();
        } catch (Throwable $e) {
            Log::warning('Firebase password reset lookup unavailable.', ['exception_class' => get_class($e)]);
            $this->unavailable();
        }
        if ($record->disabled || ! $this->identityMethods->hasPassword($record)) {
            $this->invalid();
        }

        // Invalidate Laravel sessions before consuming the one-use Firebase code.
        // A failed Firebase confirmation can force a fresh login, but cannot leave
        // pre-reset Laravel sessions active after a successful confirmation.
        try {
            DB::transaction(function () use ($record): void {
                $user = User::query()->where('firebase_uid', $record->uid)->lockForUpdate()->first();
                if (! $user) {
                    return;
                }
                $user->password_session_version = Str::random(64);
                $user->setRememberToken(Str::random(60));
                $user->save();
                if (config('session.driver') === 'database'
                    && (config('session.connection') === null || config('session.connection') === config('database.default'))) {
                    DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
                }
            }, 3);
        } catch (Throwable $e) {
            Log::warning('Firebase password reset could not revoke local sessions.', ['exception_class' => get_class($e)]);
            $this->unavailable();
        }

        try {
            $this->firebase->confirmPasswordReset($code, $password, true);
        } catch (ExpiredOobCode|InvalidOobCode) {
            $this->invalid();
        } catch (Throwable $e) {
            Log::warning('Firebase password reset confirmation unavailable.', ['exception_class' => get_class($e)]);
            $this->unavailable();
        }

        return $record->uid;
    }

    private function invalid(): never
    {
        throw new HttpResponseException(response()->json(['message' => 'This reset link is invalid or expired.',
            'code' => 'RESET_LINK_INVALID'], 422)->header('Cache-Control', 'no-store, private'));
    }

    private function unavailable(): never
    {
        throw new HttpResponseException(response()->json(['message' => 'Password reset is temporarily unavailable.'], 503)
            ->header('Cache-Control', 'no-store, private'));
    }
}
