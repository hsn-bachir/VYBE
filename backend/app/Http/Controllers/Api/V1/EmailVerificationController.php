<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

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
        if (! hash_equals((string) $user->getKey(), $id) || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return redirect($frontend.'/verify-email/error?reason=account');
        }

        if (! $user->hasVerifiedEmail() && $user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        return redirect($frontend.'/verify-email/success');
    }
}
