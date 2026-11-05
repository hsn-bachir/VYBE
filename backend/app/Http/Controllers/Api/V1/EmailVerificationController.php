<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AccountAccess;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\DB;

class EmailVerificationController extends Controller
{
    public function status(Request $request)
    {
        return (new UserResource($request->user()))->response()->setStatusCode(200);
    }

    public function resend(Request $request)
    {
        if ($request->user()->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified.']);
        }

        $request->user()->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification link sent.']);
    }

    public function verify(Request $request, string $id, string $hash)
    {
        $frontend = rtrim(config('app.frontend_url'), '/');
        if (! URL::hasValidSignature($request)) {
            $reason = (int) $request->query('expires') < now()->timestamp ? 'expired' : 'invalid';

            return redirect($frontend.'/verify-email/error?reason='.$reason);
        }

        $user = $request->user();
        if (! $user) {
            return redirect($frontend.'/login?verification=sign-in');
        }
        $user = User::query()->find($user->getKey());
        if (! $user || ! $user->canAccessAccount()) {
            return redirect($frontend.'/verify-email/error?reason=account');
        }
        if (! hash_equals((string) $user->getKey(), $id) || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return redirect($frontend.'/verify-email/error?reason=account');
        }

        $verified = DB::transaction(function () use ($user): bool {
            $current = AccountAccess::lock($user);
            return ! $current->hasVerifiedEmail() && $current->markEmailAsVerified();
        }, 3);
        if ($verified) {
            $user->refresh();
            event(new Verified($user));
        }

        return redirect($frontend.'/verify-email/success');
    }
}
