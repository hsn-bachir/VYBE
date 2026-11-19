<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptInvitationRequest;
use App\Http\Requests\Auth\FirebaseAcceptInvitationRequest;
use App\Services\AccountInvitationService;
use Illuminate\Http\Response;

class InvitationAcceptanceController extends Controller
{
    public function __invoke(AcceptInvitationRequest $request, AccountInvitationService $invitations): Response
    {
        $values = $request->validated();
        $invitations->accept($values['email'], $values['token'], $values['password']);

        return response()->noContent();
    }

    public function firebase(FirebaseAcceptInvitationRequest $request, AccountInvitationService $invitations): Response
    {
        abort_unless(config('firebase_auth.mode') === 'firebase', 404);
        $values = $request->validated();
        $invitations->acceptFirebase($values['email'], $values['token'], $values['password'] ?? null, $values['id_token'] ?? null);

        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }
}
