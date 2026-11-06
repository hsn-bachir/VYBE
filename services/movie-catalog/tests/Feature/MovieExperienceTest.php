<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class MovieExperienceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'internal-test', 'catalog.tmdb_token' => 'provider-test']);
        $this->withHeader('X-VYBE-Service-Token', 'internal-test');
        Http::preventStrayRequests();
        Sleep::fake();
    }

    private function fixture(): array
    {
        return ['id' => 550, 'title' => 'Fixture', 'runtime' => 90, 'genres' => [], 'tagline' => 'A fixture story.',
            'videos' => ['results' => [
                ['site' => 'YouTube', 'key' => 'teaser123456', 'name' => 'Teaser', 'type' => 'Teaser', 'official' => true],
                ['site' => 'YouTube', 'key' => 'bad-key', 'name' => 'Bad key', 'type' => 'Trailer', 'official' => true],
                ['site' => 'YouTube', 'key' => 'trailer12345', 'name' => 'Trailer', 'type' => 'Trailer', 'official' => false],
                ['site' => 'YouTube', 'key' => 'official123', 'name' => 'Official trailer', 'type' => 'Trailer', 'official' => true],
            ]], 'credits' => ['cast' => array_map(fn ($i) => ['id' => $i, 'name' => 'Actor '.$i, 'character' => 'Character', 'profile_path' => '/person.jpg'], range(1, 20)),
                'crew' => [['id' => 30, 'name' => 'Director', 'job' => 'Director'], ['id' => 31, 'name' => 'Writer', 'job' => 'Writer']]],
            'recommendations' => ['results' => array_map(fn ($i) => ['id' => $i, 'title' => 'Related '.$i], range(600, 620))]];
    }

    public function test_detail_warms_bounded_experience_without_changing_base_contract_or_extra_provider_calls(): void
    {
        Http::fake(['api.themoviedb.org/*' => Http::response($this->fixture())]);
        $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertJsonMissingPath('data.trailer')->assertJsonPath('data.runtime', 90);
        $this->getJson('/api/internal/v1/movies/550/experience')->assertOk()->assertJsonPath('data.trailer.key', 'official123')
            ->assertJsonCount(12, 'data.cast')->assertJsonCount(1, 'data.directors')->assertJsonCount(6, 'data.related')
            ->assertJsonPath('data.related.0.tmdb_id', 600)->assertJsonPath('meta.stale', false);
        $this->assertDatabaseHas('movies', ['tmdb_id' => 600, 'metadata_fetched_at' => null]);
        $this->getJson('/api/internal/v1/movies/550/experience')->assertOk();
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['append_to_response'] === 'videos,credits,recommendations');
    }

    public function test_empty_and_unsafe_media_are_not_fabricated(): void
    {
        $raw = $this->fixture();
        $raw['videos']['results'] = [
            ['site' => 'Vimeo', 'key' => 'official123', 'type' => 'Trailer', 'name' => 'Unsupported'],
            ['site' => 'YouTube', 'key' => 'https://evil.test', 'type' => 'Trailer', 'name' => 'Unsafe'],
            ['site' => 'YouTube', 'key' => 'official123', 'type' => 'Clip', 'name' => 'Clip'],
        ];
        $raw['credits']['cast'][0]['profile_path'] = 'https://evil.test/a.jpg';
        $raw['recommendations']['results'] = [];
        Http::fake(['*' => Http::response($raw)]);
        $this->getJson('/api/internal/v1/movies/550/experience')->assertOk()->assertJsonPath('data.trailer', null)
            ->assertJsonPath('data.cast.0.profile_path', null)->assertJsonPath('data.related', []);
    }

    public function test_stale_cache_fallback_cooldown_and_expiry_are_explicit(): void
    {
        Http::fakeSequence()->push($this->fixture())->pushStatus(503)->pushStatus(503)->pushStatus(503)->pushStatus(503);
        $this->getJson('/api/internal/v1/movies/550/experience')->assertOk();
        $this->travel(8)->days();
        $this->getJson('/api/internal/v1/movies/550/experience')->assertOk()->assertJsonPath('meta.stale', true);
        $this->getJson('/api/internal/v1/movies/550/experience')->assertOk()->assertJsonPath('meta.stale', true);
        Http::assertSentCount(3);
        $this->travel(31)->days();
        $this->getJson('/api/internal/v1/movies/550/experience')->assertStatus(503);
    }

    public function test_malformed_appends_do_not_break_detail_and_are_not_cached_as_empty(): void
    {
        $raw = $this->fixture();
        $raw['videos'] = ['results' => 'invalid'];
        Http::fake(['*' => Http::response($raw)]);
        $this->getJson('/api/internal/v1/movies/550')->assertOk();
        $this->assertFalse(Cache::has('catalog:experience:v1:550'));
        $this->getJson('/api/internal/v1/movies/550/experience')->assertStatus(503);
        $this->getJson('/api/internal/v1/movies/550/experience')->assertStatus(503);
        Http::assertSentCount(2);
    }

    public function test_auth_validation_not_found_and_lock_are_preserved(): void
    {
        Http::fake(['*' => Http::response([], 404)]);
        $this->withoutHeader('X-VYBE-Service-Token')->getJson('/api/internal/v1/movies/550/experience')->assertForbidden();
        $this->withHeader('X-VYBE-Service-Token', 'internal-test')->getJson('/api/internal/v1/movies/01/experience')->assertUnprocessable();
        $lock = Cache::lock('catalog:detail:lock:550', 30);
        $lock->get();
        $this->getJson('/api/internal/v1/movies/550/experience')->assertStatus(503);
        Http::assertNothingSent();
        $lock->release();
        $this->getJson('/api/internal/v1/movies/550/experience')->assertNotFound();
    }
}
