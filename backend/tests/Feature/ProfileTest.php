<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProfileService;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/me/profile';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Storage::fake('public');
    }

    private function signIn(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        return $user;
    }

    private function upload(array $files)
    {
        return $this->post(self::URL.'/avatar', $files, ['Content-Type' => 'multipart/form-data']);
    }

    public static function endpoints(): array
    {
        return [['GET', ''], ['PATCH', ''], ['POST', '/avatar'], ['DELETE', '/avatar']];
    }

    #[DataProvider('endpoints')]
    public function test_profile_routes_require_verified_authentication(string $method, string $suffix): void
    {
        $this->json($method, self::URL.$suffix)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs(User::factory()->unverified()->create(), 'web');
        $this->json($method, self::URL.$suffix)->assertForbidden();
    }

    public function test_resource_shape_empty_counts_auth_compatibility_and_null_legacy_date(): void
    {
        $user = $this->signIn();
        $data = $this->getJson(self::URL)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data');
        $this->assertSame(['user', 'bio', 'member_since', 'statistics'], array_keys($data));
        $this->assertSame(['id', 'username', 'email', 'avatar_url', 'email_verified_at'], array_keys($data['user']));
        $this->assertSame($this->getJson('/api/v1/auth/me')->json('data'), $data['user']);
        $this->assertSame(['watched_count' => 0, 'watchlist_count' => 0, 'review_count' => 0], $data['statistics']);
        $this->assertNull($data['bio']);
        DB::table('users')->where('id', $user->id)->update(['created_at' => null]);
        $this->getJson(self::URL)->assertJsonPath('data.member_since', null);
        $user->fill(['bio' => 'Not mass assignable', 'avatar_url' => 'https://evil.test/a']);
        $this->assertNull($user->bio);
        $this->assertNull($user->avatar_url);
        Http::assertNothingSent();
    }

    public function test_owner_counts_are_bounded_indexed_queries_and_refresh_without_catalog(): void
    {
        $user = $this->signIn();
        $other = User::factory()->create();
        foreach ([$user, $other] as $owner) {
            $owner->watchlistEntries()->create(['tmdb_id' => 550]);
            $owner->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
            $owner->reviews()->create(['tmdb_id' => 550, 'body' => 'Review']);
        }
        DB::enableQueryLog();
        $this->getJson(self::URL)->assertJsonPath('data.statistics', ['watched_count' => 1, 'watchlist_count' => 1, 'review_count' => 1]);
        $countQueries = collect(DB::getQueryLog())->filter(fn ($q) => str_contains(strtolower($q['query']), 'count(*)'));
        $this->assertCount(1, $countQueries);
        $user->reviews()->delete();
        $user->watchlistEntries()->delete();
        $this->getJson(self::URL)->assertJsonPath('data.statistics.review_count', 0)->assertJsonPath('data.statistics.watchlist_count', 0)->assertJsonPath('data.statistics.watched_count', 1);
        Http::assertNothingSent();
    }

    public function test_partial_updates_normalization_unicode_and_bio_clearing_preserve_identity(): void
    {
        $user = $this->signIn();
        $password = $user->password;
        $email = $user->email;
        $this->patchJson(self::URL, ['username' => '  MOVIE_Fan_25  ', 'bio' => " \u{00a0}Cinema\n  Storytelling \u{00a0} "])->assertOk()->assertJsonPath('data.user.username', 'movie_fan_25')->assertJsonPath('data.bio', "Cinema\n  Storytelling");
        $this->patchJson(self::URL, ['username' => 'movie_fan_25'])->assertOk();
        $this->patchJson(self::URL, ['bio' => str_repeat('🎬', 500)])->assertOk();
        foreach (['', '  ', null] as $blank) {
            $this->patchJson(self::URL, ['bio' => $blank])->assertOk()->assertJsonPath('data.bio', null);
        }
        $this->patchJson(self::URL, ['bio' => '0'])->assertOk()->assertJsonPath('data.bio', '0');
        $this->patchJson(self::URL, ['bio' => '<script>alert(1)</script>'])->assertOk()->assertJsonPath('data.bio', '<script>alert(1)</script>');
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id)->assertJsonPath('data.email', $email);
        $this->assertSame($password, $user->fresh()->password);
    }

    public static function invalidProfiles(): array
    {
        return array_map(fn ($v) => [$v], [[], ['username' => null], ['username' => ''], ['username' => 'ab'], ['username' => str_repeat('a', 31)], ['username' => 'bad-name'], ['username' => '🎬fan'], ['username' => 'ADMIN'], ['username' => 'support'], ['username' => 'system'], ['username' => 'root'], ['username' => 'vybe'], ['bio' => str_repeat('🎬', 501)], ['bio' => []], ['bio' => false],
            ...array_map(fn ($key) => [$key => 'forbidden'], ['id', 'user_id', 'email', 'password', 'email_verified_at', 'remember_token', 'avatar_url', 'created_at', 'updated_at', 'roles', 'permissions'])]);
    }

    #[DataProvider('invalidProfiles')]
    public function test_strict_profile_validation(array $body): void
    {
        $this->signIn();
        $this->patchJson(self::URL, $body)->assertUnprocessable();
    }

    public function test_unique_username_and_unknown_query_form_body_are_rejected(): void
    {
        $user = $this->signIn();
        User::factory()->create(['username' => 'already_used']);
        $this->patchJson(self::URL, ['username' => 'ALREADY_USED'])->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->getJson(self::URL.'?user_id='.$user->id)->assertUnprocessable();
        $this->patch(self::URL, ['bio' => 'Form'])->assertUnprocessable();
        $this->deleteJson(self::URL.'/avatar', ['path' => '../secret'])->assertUnprocessable();
        $this->getJson('/api/v1/me/profile/'.$user->id)->assertNotFound();
    }

    public static function formats(): array
    {
        return [['jpg'], ['png'], ['webp']];
    }

    #[DataProvider('formats')]
    public function test_valid_images_are_reencoded_bounded_served_and_removable(string $extension): void
    {
        $user = $this->signIn();
        $original = UploadedFile::fake()->image('untrusted-name.'.$extension, 1024, 768);
        $response = $this->upload(['avatar' => $original])->assertOk();
        $reference = $user->fresh()->getRawOriginal('avatar_url');
        $this->assertMatchesRegularExpression('#^/avatars/'.$user->id.'/[a-f0-9]{32}\.webp$#', $reference);
        $this->assertSame(rtrim(config('app.url'), '/').$reference, $response->json('data.user.avatar_url'));
        $bytes = Storage::disk('public')->get(substr($reference, 1));
        $info = getimagesizefromstring($bytes);
        $this->assertSame('image/webp', $info['mime']);
        $this->assertSame(512, $info[0]);
        $this->assertSame(384, $info[1]);
        $this->get($reference)->assertOk()->assertHeader('Content-Type', 'image/webp')->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->get(str_replace('/'.$user->id.'/', '/999999/', $reference))->assertNotFound();
        $this->deleteJson(self::URL.'/avatar')->assertOk()->assertJsonPath('data.user.avatar_url', null);
        Storage::disk('public')->assertMissing(substr($reference, 1));
        $this->deleteJson(self::URL.'/avatar')->assertOk();
    }

    public function test_minimum_dimensions_replacement_and_metadata_stripping(): void
    {
        $user = $this->signIn();
        $image = UploadedFile::fake()->image('photo.png', 1, 1);
        $bytes = file_get_contents($image->getRealPath()).'UNTRUSTED_METADATA_MARKER';
        $this->upload(['avatar' => UploadedFile::fake()->createWithContent('../../escape.png', $bytes)])->assertOk();
        $old = $user->fresh()->getRawOriginal('avatar_url');
        $this->assertStringNotContainsString('UNTRUSTED_METADATA_MARKER', Storage::disk('public')->get(substr($old, 1)));
        $this->upload(['avatar' => UploadedFile::fake()->image('replace.png')])->assertOk();
        $new = $user->fresh()->getRawOriginal('avatar_url');
        $this->assertNotSame($old, $new);
        Storage::disk('public')->assertMissing(substr($old, 1));
        Storage::disk('public')->assertExists(substr($new, 1));
    }

    public static function invalidAvatars(): array
    {
        return [['fake'], ['svg'], ['gif'], ['corrupt'], ['wide'], ['tall'], ['large'], ['missing'], ['extra']];
    }

    #[DataProvider('invalidAvatars')]
    public function test_rejected_uploads_do_not_change_the_current_avatar(string $kind): void
    {
        $user = $this->signIn();
        $user->avatar_url = 'https://legacy.test/keep.jpg';
        $user->save();
        $file = match ($kind) {
            'fake' => UploadedFile::fake()->createWithContent('fake.jpg', '<html>not an image</html>'),
            'svg' => UploadedFile::fake()->createWithContent('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
            'gif' => UploadedFile::fake()->image('x.gif'),
            'corrupt' => UploadedFile::fake()->createWithContent('x.png', "\x89PNG\r\n\x1a\nCORRUPT"),
            'wide' => UploadedFile::fake()->image('wide.png', 2049, 1),
            'tall' => UploadedFile::fake()->image('tall.png', 1, 2049),
            'large' => UploadedFile::fake()->image('large.png')->size(2049),
            default => UploadedFile::fake()->image('valid.png'),
        };
        $data = $kind === 'missing' ? [] : ['avatar' => $file];
        if ($kind === 'extra') {
            $data['user_id'] = 2;
        }
        $this->upload($data)->assertUnprocessable();
        $this->assertSame('https://legacy.test/keep.jpg', $user->fresh()->avatar_url);
        $this->assertCount(0, Storage::disk('public')->allFiles());
    }

    public function test_legacy_paths_and_other_user_files_are_not_deleted(): void
    {
        $user = $this->signIn();
        $other = User::factory()->create();
        $path = 'avatars/'.$other->id.'/'.str_repeat('a', 32).'.webp';
        Storage::disk('public')->put($path, 'owned by another user');
        foreach (['https://legacy.test/avatar.jpg', '/'.$path, '/avatars/'.$user->id.'/../secret.webp'] as $legacy) {
            $user->avatar_url = $legacy;
            $user->save();
            $this->deleteJson(self::URL.'/avatar')->assertOk()->assertJsonPath('data.user.avatar_url', null);
            Storage::disk('public')->assertExists($path);
        }
    }

    public function test_storage_and_database_failure_preserve_old_avatar_and_cleanup_new_file(): void
    {
        $user = $this->signIn();
        $this->upload(['avatar' => UploadedFile::fake()->image('old.png')])->assertOk();
        $old = $user->fresh()->getRawOriginal('avatar_url');
        $disk = Storage::disk('public');
        Storage::shouldReceive('disk')->with('public')->andReturn($disk);
        User::saving(function (User $saving) {
            if ($saving->isDirty('avatar_url')) {
                throw new \RuntimeException('SQL secret');
            }
        });
        $this->upload(['avatar' => UploadedFile::fake()->image('new.png')])->assertStatus(500)->assertJsonMissing(['message' => 'SQL secret']);
        User::flushEventListeners();
        $this->assertSame($old, $user->fresh()->getRawOriginal('avatar_url'));
        $this->assertCount(1, $disk->allFiles());
    }

    public function test_failed_storage_returns_safe_temporary_failure(): void
    {
        $user = $this->signIn();
        $user->avatar_url = 'https://legacy.test/keep.jpg';
        $user->save();
        $disk = \Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('put')->andReturn(false);
        $disk->shouldReceive('delete')->andReturn(true);
        Storage::shouldReceive('disk')->with('public')->andReturn($disk);
        $this->upload(['avatar' => UploadedFile::fake()->image('new.png')])->assertStatus(503)->assertJsonPath('code', 'AVATAR_UNAVAILABLE');
        $this->assertSame('https://legacy.test/keep.jpg', $user->fresh()->avatar_url);
    }

    public function test_actual_csrf_safe_errors_and_upload_rate_limit(): void
    {
        $user = $this->signIn();
        $this->app['env'] = 'local';
        config(['app.debug' => true]);
        $this->patchJson(self::URL, ['bio' => 'No CSRF'])->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        $csrf = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $csrf->getCookie('XSRF-TOKEN', false)->getValue());
        $this->patchJson(self::URL, ['bio' => 'Valid CSRF'])->assertOk();
        for ($i = 0; $i < 5; $i++) {
            $this->upload(['avatar' => UploadedFile::fake()->image('x.png')])->assertOk();
        }
        $this->upload(['avatar' => UploadedFile::fake()->image('x.png')])->assertTooManyRequests()->assertHeader('Retry-After');
        $this->deleteJson(self::URL.'/avatar')->assertOk();
        $this->mock(ProfileService::class)->shouldReceive('read')->andThrow(new \RuntimeException('SQL secret'));
        $this->get(self::URL)->assertStatus(500)->assertExactJson(['message' => 'Unable to update your profile. Please try again.', 'code' => 'INTERNAL_ERROR']);
    }

    public function test_username_sql_conflicts_after_validation_are_translated_to_field_errors(): void
    {
        $user = $this->signIn();
        $other = User::factory()->create();
        User::saving(function (User $saving) use ($other) {
            if ($saving->isDirty('username')) {
                DB::table('users')->where('id', $other->id)->update(['username' => $saving->username]);
            }
        });
        try {
            $this->patchJson(self::URL, ['username' => 'raced_name'])->assertUnprocessable()->assertJsonValidationErrors('username');
        } finally {
            User::flushEventListeners();
        }
        $this->assertNotSame('raced_name', $user->fresh()->username);
    }

    public function test_jpeg_orientation_is_normalized_and_exif_is_not_published(): void
    {
        $this->signIn();
        $jpeg = UploadedFile::fake()->image('rotated.jpg', 40, 20);
        // Minimal little-endian TIFF with orientation=6, inside a JPEG APP1 segment.
        $exif = "Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
        $bytes = file_get_contents($jpeg->getRealPath());
        $bytes = substr($bytes, 0, 2)."\xff\xe1".pack('n', strlen($exif) + 2).$exif.substr($bytes, 2);
        $response = $this->upload(['avatar' => UploadedFile::fake()->createWithContent('rotated.jpg', $bytes)])->assertOk();
        $reference = parse_url($response->json('data.user.avatar_url'), PHP_URL_PATH);
        $encoded = Storage::disk('public')->get(substr($reference, 1));
        $dimensions = getimagesizefromstring($encoded);
        $this->assertSame([20, 40], [$dimensions[0], $dimensions[1]]);
        $this->assertStringNotContainsString('Exif', $encoded);
    }

    public static function orientations(): array
    {
        return [[1, [240, 0, 0]], [2, [0, 240, 0]], [3, [240, 240, 0]], [4, [0, 0, 240]], [5, [240, 0, 0]], [6, [0, 0, 240]], [7, [240, 240, 0]], [8, [0, 240, 0]]];
    }

    #[DataProvider('orientations')]
    public function test_all_exif_rotations_and_mirrors_preserve_the_expected_corner(int $orientation, array $expected): void
    {
        $this->signIn();
        $image = imagecreatetruecolor(80, 40);
        foreach ([[0, 0, 39, 19, 240, 0, 0], [40, 0, 79, 19, 0, 240, 0], [0, 20, 39, 39, 0, 0, 240], [40, 20, 79, 39, 240, 240, 0]] as [$x1, $y1, $x2, $y2, $r, $g, $b]) {
            imagefilledrectangle($image, $x1, $y1, $x2, $y2, imagecolorallocate($image, $r, $g, $b));
        }
        ob_start();
        imagejpeg($image, null, 100);
        $bytes = ob_get_clean();
        $exif = "Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0".pack('v', $orientation)."\0\0\0\0\0\0";
        $bytes = substr($bytes, 0, 2)."\xff\xe1".pack('n', strlen($exif) + 2).$exif.substr($bytes, 2);
        $response = $this->upload(['avatar' => UploadedFile::fake()->createWithContent('oriented.jpg', $bytes)])->assertOk();
        $path = substr(parse_url($response->json('data.user.avatar_url'), PHP_URL_PATH), 1);
        $output = imagecreatefromstring(Storage::disk('public')->get($path));
        $color = imagecolorsforindex($output, imagecolorat($output, 3, 3));
        foreach (['red', 'green', 'blue'] as $index => $channel) {
            $this->assertEqualsWithDelta($expected[$index], $color[$channel], 25);
        }
    }
}
