<?php

use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Middleware\PreventAuthCaching;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware([PreventAuthCaching::class, 'throttle:verification-link'])->name('verification.verify');
