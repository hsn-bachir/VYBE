<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $email = is_string($request->input('email')) ? Str::lower(trim($request->input('email'))) : '';

            return [
                Limit::perMinute(30)->by('ip:'.$request->ip()),
                Limit::perMinute(5)->by('account:'.hash('sha256', $email).'|'.$request->ip()),
            ];
        });
        RateLimiter::for('register', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        RateLimiter::for('verification', fn (Request $request) => Limit::perMinute(3)->by('verification:'.$request->user()->getKey()));
        RateLimiter::for('verification-link', fn (Request $request) => Limit::perMinute(20)->by('verification-link:'.$request->ip()));
        RateLimiter::for('library-read', fn (Request $request) => Limit::perMinute(120)->by('library-read:'.$request->user()->getKey()));
        RateLimiter::for('library-write', fn (Request $request) => Limit::perMinute(60)->by('library-write:'.$request->user()->getKey()));
    }
}
