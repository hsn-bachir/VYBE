<?php

namespace App\Services;

use App\Models\AdministrativeAction;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\EmailExists;
use Kreait\Firebase\Exception\Auth\EmailNotFound;
use Kreait\Firebase\Exception\Auth\UserNotFound;
use Throwable;

class FirebaseAdminIdentityService
{
    public function __construct(private Auth $firebase, private FirebaseAuthentication $authentication,
        private FirebaseIdentityMethods $identityMethods) {}

    public function confirm(User $actor, string $token): void
    {
        $identity = $this->authentication->verify($token);
        if (! $actor->firebase_uid || ! hash_equals($actor->firebase_uid, $identity->uid)) {
            $this->error(403, 'The confirmed Firebase identity does not match this administrator.', 'IDENTITY_MISMATCH');
        }
        // A fresh sign-in token is a one-operation confirmation, even if copied or replayed.
        try {
            $reserved = Cache::add('admin-identity-confirmation:'.hash('sha256', $token), true, 300);
        } catch (Throwable $e) {
            Log::warning('Administrator reauthentication replay protection unavailable.', ['exception_class' => get_class($e)]);
            $this->error(503, 'Administrator confirmation is temporarily unavailable.', 'REAUTH_UNAVAILABLE');
        }
        if (! $reserved) {
            $this->error(409, 'Confirm your identity again before this action.', 'REAUTH_REPLAYED');
        }
    }

    public function record(User $target): UserRecord
    {
        if (! $target->firebase_uid) {
            $this->error(409, 'This account has no linked Firebase identity.', 'IDENTITY_NOT_LINKED');
        }
        try {
            $record = $this->firebase->getUser($target->firebase_uid);
        } catch (UserNotFound) {
            $this->error(409, 'The Firebase identity is missing. Reconcile this account before continuing.', 'IDENTITY_MISSING');
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
        if ($record->disabled || $record->uid !== $target->firebase_uid
            || Str::lower((string) $record->email) !== $target->email) {
            $this->error(409, 'The Firebase identity differs from the VYBE account. Reconcile it before continuing.', 'IDENTITY_CONFLICT');
        }

        return $record;
    }

    public function methods(UserRecord $record): array
    {
        return $this->identityMethods->forRecord($record);
    }

    public function lookupEmail(string $email): ?UserRecord
    {
        try {
            return $this->firebase->getUserByEmail($email);
        } catch (EmailNotFound|UserNotFound) {
            return null;
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
    }

    public function provision(string $uid, string $email): void
    {
        $existing = $this->lookupEmail($email);
        if ($existing && $existing->uid !== $uid) {
            $this->error(409, 'This email already belongs to a Firebase identity. Use the explicit account-linking process.', 'IDENTITY_CONFLICT');
        }
        if ($existing) {
            return;
        }
        try {
            $this->firebase->createUser(['uid' => $uid, 'email' => $email, 'emailVerified' => false]);
        } catch (EmailExists) {
            $this->error(409, 'This email already belongs to a Firebase identity.', 'IDENTITY_CONFLICT');
        } catch (Throwable $e) {
            // The request may have succeeded remotely before its response failed. A retry
            // looks up the reserved UID and never deletes an identity automatically.
            $this->unavailable($e);
        }
    }

    public function setInvitationPassword(User $target, string $password): void
    {
        $this->record($target);
        try {
            $this->firebase->updateUser($target->firebase_uid, ['password' => $password, 'emailVerified' => true]);
            $this->firebase->revokeRefreshTokens($target->firebase_uid);
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
    }

    public function verifyExistingInvitationIdentity(string $uid, string $email): void
    {
        try {
            $record = $this->firebase->getUser($uid);
            if ($record->uid !== $uid || $record->disabled || Str::lower((string) $record->email) !== $email) {
                $this->error(409, 'The signed-in Firebase identity does not match this invitation.', 'IDENTITY_CONFLICT');
            }
            if (! $record->emailVerified) {
                // The invitation token delivered to this address proves mailbox ownership.
                $this->firebase->updateUser($uid, ['emailVerified' => true]);
                $this->firebase->revokeRefreshTokens($uid);
            }
        } catch (HttpResponseException $e) {
            throw $e;
        } catch (UserNotFound) {
            $this->error(409, 'The Firebase identity is missing.', 'IDENTITY_MISSING');
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
    }

    public function setPassword(User $target, string $password): void
    {
        $record = $this->record($target);
        if (! in_array('password', $this->methods($record), true)) {
            $this->error(409, 'This account has no email/password sign-in method.', 'PASSWORD_PROVIDER_UNAVAILABLE');
        }
        try {
            $this->firebase->updateUser($target->firebase_uid, ['password' => $password]);
            $this->firebase->revokeRefreshTokens($target->firebase_uid);
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
    }

    public function sendPasswordReset(User $target): void
    {
        $record = $this->record($target);
        if (! in_array('password', $this->methods($record), true)) {
            $this->error(409, 'This account has no email/password sign-in method.', 'PASSWORD_PROVIDER_UNAVAILABLE');
        }
        try {
            $this->firebase->sendPasswordResetLink($target->email, [
                'url' => rtrim(config('app.frontend_url'), '/').'/password/reset',
                'handleCodeInApp' => false,
            ]);
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
    }

    public function setEmail(User $target, string $email): void
    {
        if (! $target->firebase_uid) {
            $this->error(409, 'This account has no linked Firebase identity.', 'IDENTITY_NOT_LINKED');
        }
        try {
            $record = $this->firebase->getUser($target->firebase_uid);
        } catch (UserNotFound) {
            $this->error(409, 'The Firebase identity is missing.', 'IDENTITY_MISSING');
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
        if ($record->uid !== $target->firebase_uid || $record->disabled
            || ! in_array(Str::lower((string) $record->email), [$target->email, $email], true)) {
            $this->error(409, 'The Firebase identity differs from the VYBE account.', 'IDENTITY_CONFLICT');
        }
        $owner = $this->lookupEmail($email);
        if ($owner && $owner->uid !== $target->firebase_uid) {
            $this->error(409, 'This email already belongs to a Firebase identity.', 'IDENTITY_CONFLICT');
        }
        if ($record->email === $email) {
            return;
        }
        try {
            $this->firebase->updateUser($target->firebase_uid, ['email' => $email, 'emailVerified' => false]);
            $this->firebase->revokeRefreshTokens($target->firebase_uid);
        } catch (EmailExists) {
            $this->error(409, 'This email already belongs to a Firebase identity.', 'IDENTITY_CONFLICT');
        } catch (Throwable $e) {
            $this->unavailable($e);
        }
    }

    public function revokeLocalSessions(User $target): void
    {
        $target->password_session_version = Str::random(64);
        $target->setRememberToken(Str::random(60));
        $target->save();
        if (config('session.driver') === 'database'
            && (config('session.connection') === null || config('session.connection') === config('database.default'))) {
            DB::table(config('session.table', 'sessions'))->where('user_id', $target->id)->delete();
        }
    }

    public function audit(User $actor, User $target, string $action, ?string $reason = null, array $details = []): void
    {
        AdministrativeAction::query()->create([
            'actor_id' => $actor->id, 'action' => $action, 'target_type' => 'user', 'target_id' => $target->id,
            'reason' => $reason, 'details' => $details, 'created_at' => now(),
        ]);
    }

    private function unavailable(Throwable $e): never
    {
        Log::warning('Firebase administrator identity operation unavailable.', ['exception_class' => get_class($e)]);
        $this->error(503, 'Firebase identity management is temporarily unavailable.', 'IDENTITY_UNAVAILABLE');
    }

    public function error(int $status, string $message, string $code): never
    {
        throw new HttpResponseException(response()->json(['message' => $message, 'code' => $code], $status)
            ->header('Cache-Control', 'no-store, private'));
    }
}
