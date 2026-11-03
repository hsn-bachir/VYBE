<?php

use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Middleware\PreventAuthCaching;
use Illuminate\Support\Facades\Route;

Route::get('/avatars/{owner}/{filename}', [ProfileController::class, 'image'])
    ->where('owner', '[1-9][0-9]*')->where('filename', '[a-f0-9]{32}\.webp')->withoutMiddleware('web');

Route::get('/', function () {
    return view('welcome');
});

Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware([PreventAuthCaching::class, 'throttle:verification-link'])->name('verification.verify');
