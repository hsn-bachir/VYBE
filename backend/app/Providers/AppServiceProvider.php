<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;

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
        ResetPassword::createUrlUsing(fn (User $user, string $token) => rtrim(config('app.frontend_url'), '/')
            .'/password/reset#email='.rawurlencode($user->email).'&token='.rawurlencode($token));
        Gate::define('admin.read', fn (User $user) => $user->canAccessAccount() && $user->canAdminister());
        Gate::define('moderation.read', fn (User $user) => $user->canAccessAccount() && $user->canModerate());
        Gate::define('privileged.write', fn (User $user) => $user->canWriteCommunity() && $user->canModerate());
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
        RateLimiter::for('community-read', fn (Request $request) => Limit::perMinute(120)->by('community-read:'.$request->ip()));
        RateLimiter::for('avatar-upload', fn (Request $request) => Limit::perMinute(5)->by('avatar-upload:'.$request->user()->getKey()));
        RateLimiter::for('admin-read', fn (Request $request) => [
            Limit::perMinute(60)->by('admin-read:user:'.$request->user()->getKey()),
            Limit::perMinute(120)->by('admin-read:ip:'.$request->ip()),
        ]);
        RateLimiter::for('admin-write', fn (Request $request) => [
            Limit::perMinute(20)->by('admin-write:user:'.$request->user()->getKey()),
            Limit::perMinute(60)->by('admin-write:ip:'.$request->ip()),
        ]);
        RateLimiter::for('admin-invitation-target', fn (Request $request) =>
            Limit::perHour(3)->by('admin-invitation:'.(string) $request->route('id')));
        RateLimiter::for('admin-password-change', fn (Request $request) => [
            Limit::perMinute(5)->by('admin-password-change:actor:'.$request->user()->getKey()),
            Limit::perHour(5)->by('admin-password-change:target:'.(string) $request->route('id')),
        ]);
        RateLimiter::for('admin-password-reset', fn (Request $request) => [
            Limit::perHour(10)->by('admin-password-reset:actor:'.$request->user()->getKey()),
            Limit::perHour(3)->by('admin-password-reset:target:'.(string) $request->route('id')),
        ]);
        RateLimiter::for('password-reset-complete', fn (Request $request) => [
            Limit::perMinute(5)->by('password-reset-complete:ip:'.$request->ip()),
            Limit::perHour(5)->by('password-reset-complete:email:'.hash('sha256', (string) $request->input('email'))),
        ]);
        RateLimiter::for('invitation-accept', fn (Request $request) => [
            Limit::perMinute(5)->by('invitation-accept:ip:'.$request->ip()),
            Limit::perHour(5)->by('invitation-accept:token:'.hash('sha256', (string) $request->input('token'))),
        ]);
    }
}
