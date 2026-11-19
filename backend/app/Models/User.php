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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

#[Fillable(['username', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'password_session_version', 'firebase_uid'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected static function booted(): void
    {
        static::created(function (User $user): void {
            // Backfill handles users created before this migration. The table
            // guard also keeps rolling migrations safe during deployment.
            if (Schema::hasTable('collections') && Schema::hasColumn('collections', 'system_key')) {
                DB::table('collections')->insertOrIgnore([
                    'user_id' => $user->id, 'name' => 'Favorites', 'system_key' => Collection::FAVORITES,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
    }

    public const ROLE_USER = 'user';

    public const ROLE_MODERATOR = 'moderator';

    public const ROLE_ADMIN = 'admin';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_RESTRICTED = 'restricted';

    public const STATUS_BANNED = 'banned';

    public const STATUS_DEACTIVATED = 'deactivated';

    public function canAccessAccount(): bool
    {
        return in_array($this->account_status, [self::STATUS_ACTIVE, self::STATUS_RESTRICTED], true);
    }

    public function canWriteCommunity(): bool
    {
        return $this->account_status === self::STATUS_ACTIVE;
    }

    public function canModerate(): bool
    {
        return in_array($this->role, [self::ROLE_MODERATOR, self::ROLE_ADMIN], true);
    }

    public function canAdminister(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

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

    public function reports(): HasMany
    {
        return $this->hasMany(Report::class, 'reporter_id');
    }

    public function administrativeActions(): HasMany
    {
        return $this->hasMany(AdministrativeAction::class, 'actor_id');
    }

    public function accountInvitations(): HasMany
    {
        return $this->hasMany(AccountInvitation::class);
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
            'invitation_pending' => 'boolean',
            'password' => 'hashed',
        ];
    }
}
