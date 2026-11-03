<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

#[Fillable(['username', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public function watchlistEntries(): HasMany
    {
        return $this->hasMany(WatchlistEntry::class);
    }

    public function watchedMovies(): HasMany
    {
        return $this->hasMany(WatchedMovie::class);
    }

    public function collections(): HasMany
    {
        return $this->hasMany(Collection::class);
    }

    public function movieRatings(): HasMany
    {
        return $this->hasMany(MovieRating::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    protected function username(): Attribute
    {
        return Attribute::make(set: fn (string $value) => Str::lower($value));
    }

    protected function avatarUrl(): Attribute
    {
        return Attribute::make(get: function (?string $value): ?string {
            if ($value && preg_match('#^/avatars/[1-9][0-9]*/[a-f0-9]{32}\.webp$#D', $value)) {
                return rtrim(config('app.url'), '/').$value;
            }

            return $value && filter_var($value, FILTER_VALIDATE_URL) && in_array(parse_url($value, PHP_URL_SCHEME), ['http', 'https'], true) ? $value : null;
        });
    }

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value) => Str::lower(trim($value)));
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
