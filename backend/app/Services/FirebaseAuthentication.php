<?php

namespace App\Services;

use DateTimeInterface;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Log;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Kreait\Firebase\Exception\Auth\RevokedIdToken;
use Kreait\Firebase\Exception\Auth\UserNotFound;
use Throwable;

class FirebaseAuthentication
{
    public function __construct(private Auth $firebase) {}

    public function verify(string $idToken, ?string $expectedProvider = null): FirebaseIdentity
    {
        $project = config('firebase_auth.project_id');
        if (! is_string($project) || $project === '') {
            $this->reject(503, 'Firebase authentication is unavailable.');
        }
        if (config('firebase_auth.emulator_host') && ! app()->environment(['local', 'testing'])) {
            $this->reject(503, 'Firebase authentication is unavailable.');
        }

        try {
            // Revocation requires a Firebase lookup, only at session establishment.
            $token = $this->firebase->verifyIdToken($idToken, true);
            $claims = $token->claims();
            $uid = $claims->get('sub', '');
            $authTime = $claims->get('auth_time', 0);
            if ($authTime instanceof DateTimeInterface) {
                $authTime = $authTime->getTimestamp();
            }
            $audience = $claims->get('aud');
            $firebaseClaims = $claims->get('firebase');
            if ((is_string($audience) ? [$audience] : $audience) !== [$project]
                || $claims->get('iss') !== 'https://securetoken.google.com/'.$project
                || ! is_string($uid) || $uid === '' || strlen($uid) > 128
                || ! is_numeric($authTime)
                || (int) $authTime > time()
                || time() - (int) $authTime > config('firebase_auth.max_auth_age_seconds')
                || ($expectedProvider !== null && (! is_array($firebaseClaims)
                    || ($firebaseClaims['sign_in_provider'] ?? null) !== $expectedProvider))) {
                $this->reject(401, 'Firebase authentication must be recent and valid.');
            }

            $identity = $this->lookup($uid);

            return new FirebaseIdentity($identity->uid, $identity->email, $identity->emailVerified,
                is_array($firebaseClaims) && is_string($firebaseClaims['sign_in_provider'] ?? null)
                    ? $firebaseClaims['sign_in_provider'] : null);
        } catch (HttpResponseException $e) {
            throw $e;
        } catch (RevokedIdToken $e) {
            $this->reject(401, 'Firebase authentication has expired.');
        } catch (FailedToVerifyToken $e) {
            // The SDK wraps failures while fetching revocation state with a cause.
            $unavailable = $e->getPrevious() && ! $e->getPrevious() instanceof UserNotFound;
            if ($unavailable) {
                Log::warning('Firebase verification unavailable.', ['stage' => 'revocation', 'exception_class' => get_class($e->getPrevious())]);
            }
            $this->reject($unavailable ? 503 : 401, $unavailable
                ? 'Firebase authentication is unavailable.' : 'Invalid Firebase ID token.');
        } catch (UserNotFound $e) {
            $this->reject(401, 'Firebase identity is unavailable.');
        } catch (Throwable $e) {
            Log::warning('Firebase verification unavailable.', ['stage' => 'verification', 'exception_class' => get_class($e)]);
            $this->reject(503, 'Firebase authentication is unavailable.');
        }
    }

    public function lookup(string $uid): FirebaseIdentity
    {
        try {
            $record = $this->firebase->getUser($uid);
            if ($record->disabled || $record->uid !== $uid) {
                $this->reject(401, 'Firebase identity is unavailable.');
            }
            if (! is_string($record->email) || ! filter_var($record->email, FILTER_VALIDATE_EMAIL)
                || strlen($record->email) > 255) {
                throw new HttpResponseException(response()->json([
                    'message' => 'This Firebase identity has no usable email address.',
                    'code' => 'EMAIL_REQUIRED',
                ], 422)->header('Cache-Control', 'no-store, private'));
            }

            return new FirebaseIdentity($uid, strtolower(trim($record->email)), $record->emailVerified);
        } catch (HttpResponseException $e) {
            throw $e;
        } catch (UserNotFound $e) {
            $this->reject(401, 'Firebase identity is unavailable.');
        } catch (Throwable $e) {
            Log::warning('Firebase identity lookup unavailable.', ['stage' => 'lookup', 'exception_class' => get_class($e)]);
            $this->reject(503, 'Firebase authentication is unavailable.');
        }
    }

    private function reject(int $status, string $message): never
    {
        throw new HttpResponseException(response()->json(['message' => $message], $status)
            ->header('Cache-Control', 'no-store, private'));
    }
}
