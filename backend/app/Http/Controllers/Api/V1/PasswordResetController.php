<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Services\PasswordResetService;
use Illuminate\Support\Facades\Auth;

class PasswordResetController extends Controller
{
    public function __invoke(ResetPasswordRequest $request, PasswordResetService $passwords)
    {
        $values = $request->validated();
        $passwords->reset($values);
        if ($request->user()?->email === $values['email']) {
            Auth::guard('web')->logoutCurrentDevice();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }
}
