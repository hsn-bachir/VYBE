<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FirebaseAuthentication;
use App\Services\ProfileService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Kreait\Firebase\Contract\Auth as FirebaseAuth;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PublicProfileTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/users/';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        foreach ([FirebaseAuthentication::class, FirebaseAuth::class] as $service) {
            $this->app->bind($service, fn () => throw new \RuntimeException('Public profiles must not resolve Firebase.'));
        }
    }

    public static function eligibleStatuses(): array
    {
        return [[User::STATUS_ACTIVE], [User::STATUS_RESTRICTED]];
    }

    #[DataProvider('eligibleStatuses')]
    public function test_guest_receives_only_the_approved_identity_fields(string $status): void
    {
        $target = User::factory()->create([
            'account_status' => $status, 'bio' => 'Private biography', 'firebase_uid' => 'private-test-uid',
            'role' => User::ROLE_ADMIN, 'password_session_version' => 'private-session-version',
        ]);
        $target->watchlistEntries()->create(['tmdb_id' => 550]);
        $target->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        $target->reviews()->create(['tmdb_id' => 550, 'body' => 'Existing public review']);

        $this->get(self::URL.$target->id)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => ['id' => $target->id, 'username' => $target->username, 'avatar_url' => null]]);
        Http::assertNothingSent();
    }

    public function test_owner_and_other_verified_member_receive_the_same_public_projection(): void
    {
        $target = User::factory()->create();
        $expected = ['data' => ['id' => $target->id, 'username' => $target->username, 'avatar_url' => null]];
        foreach ([$target, User::factory()->create()] as $viewer) {
            $this->actingAs($viewer, 'web')->get(self::URL.$target->id)->assertOk()->assertExactJson($expected);
        }
        Http::assertNothingSent();
    }

    public function test_guest_read_does_not_grant_authenticated_viewer_privileges(): void
    {
        $target = User::factory()->create();
        $viewer = User::factory()->unverified()->create(['account_status' => User::STATUS_BANNED]);
        $this->actingAs($viewer, 'web')->get(self::URL.$target->id)->assertOk();
        $this->getJson('/api/v1/me/profile')->assertForbidden();
    }

    public function test_username_and_avatar_changes_keep_the_same_public_url(): void
    {
        config(['app.url' => 'https://core.test']);
        $target = User::factory()->create();
        $url = self::URL.$target->id;
        $this->get($url)->assertJsonPath('data.username', $target->username)->assertJsonPath('data.avatar_url', null);
        $target->forceFill(['username' => 'updated_member', 'avatar_url' => '/avatars/'.$target->id.'/'.str_repeat('a', 32).'.webp'])->save();
        $this->get($url)->assertOk()->assertExactJson(['data' => [
            'id' => $target->id, 'username' => 'updated_member',
            'avatar_url' => 'https://core.test/avatars/'.$target->id.'/'.str_repeat('a', 32).'.webp',
        ]]);
    }

    public static function unavailableTargets(): array
    {
        return [
            [['account_status' => User::STATUS_BANNED]],
            [['account_status' => User::STATUS_DEACTIVATED]],
            [['email_verified_at' => null]],
            [['invitation_pending' => true]],
            [['account_status' => User::STATUS_RESTRICTED, 'email_verified_at' => null]],
            [['role' => User::ROLE_ADMIN, 'account_status' => User::STATUS_BANNED]],
        ];
    }

    #[DataProvider('unavailableTargets')]
    public function test_ineligible_and_missing_targets_are_indistinguishable(array $attributes): void
    {
        $target = User::factory()->create($attributes);
        foreach ([$target->id, 2147483647] as $id) {
            $this->get(self::URL.$id)->assertNotFound()->assertHeader('Cache-Control', 'no-store, private')
                ->assertExactJson(['message' => 'Not found.']);
        }
    }

    public function test_eligibility_is_rechecked_between_reads_including_for_the_owner(): void
    {
        $target = User::factory()->create();
        $url = self::URL.$target->id;
        $this->actingAs($target, 'web')->get($url)->assertOk();
        DB::table('users')->where('id', $target->id)->update(['invitation_pending' => true]);
        $this->get($url)->assertNotFound();
        DB::table('users')->where('id', $target->id)->update(['invitation_pending' => false, 'account_status' => User::STATUS_RESTRICTED]);
        $this->get($url)->assertOk();
        DB::table('users')->where('id', $target->id)->update(['email_verified_at' => null]);
        $this->get($url)->assertNotFound();
    }

    public static function invalidIds(): array
    {
        return array_map(fn ($id) => [$id], ['0', '-1', '1.5', '01', '+1', '1e2', 'abc', '2147483648', str_repeat('9', 40), '%201', '1%20']);
    }

    #[DataProvider('invalidIds')]
    public function test_invalid_route_ids_return_json_validation_without_a_lookup(string $id): void
    {
        $this->mock(ProfileService::class)->shouldNotReceive('publicProfile');
        $this->get(self::URL.$id)->assertUnprocessable()->assertJsonValidationErrors('id')
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_query_or_body_cannot_override_the_route_id(): void
    {
        $target = User::factory()->create();
        $this->get(self::URL.$target->id.'?id=2147483647')->assertUnprocessable()->assertJsonValidationErrors('id');
        $this->get(self::URL.$target->id.'?include=email')->assertUnprocessable()->assertJsonValidationErrors('include');
        $this->json('GET', self::URL.$target->id, ['id' => 2147483647])->assertUnprocessable()->assertJsonValidationErrors('body');
        $this->call('GET', self::URL.$target->id, [], [], [], ['CONTENT_TYPE' => 'application/json'], '{}')
            ->assertUnprocessable()->assertJsonValidationErrors('body');
    }

    public function test_lookup_selects_only_public_fields_in_one_read_query(): void
    {
        $target = User::factory()->create();
        DB::enableQueryLog();
        DB::flushQueryLog();
        $public = app(ProfileService::class)->publicProfile($target->id);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(1, $queries);
        $this->assertStringStartsWith('select ', strtolower($queries[0]['query']));
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($public->getAttributes()));
        $this->assertSame([], $public->getRelations());
        Http::assertNothingSent();
    }

    public function test_shared_public_read_throttle_and_no_store_on_rejection(): void
    {
        $target = User::factory()->create();
        for ($i = 0; $i < 119; $i++) {
            $this->get(self::URL.$target->id)->assertOk();
        }
        $this->getJson('/api/v1/movies/550/reviews')->assertOk();
        $this->get(self::URL.$target->id)->assertStatus(429)->assertHeader('Retry-After')
            ->assertHeader('Cache-Control', 'no-store, private')->assertExactJson(['message' => 'Too many requests.']);
    }

    public function test_unexpected_failure_is_sanitized_json_with_no_store(): void
    {
        $this->mock(ProfileService::class)->shouldReceive('publicProfile')->once()
            ->andThrow(new \RuntimeException('Internal profile lookup failure.'));
        $this->get(self::URL.'1')->assertStatus(500)->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
    }
}
