<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptInvitationRequest;
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
}
