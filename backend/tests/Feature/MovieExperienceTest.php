<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MovieExperienceTest extends TestCase
{
    private function fixture(): array
    {
        return ['data' => ['tmdb_id' => 550, 'tagline' => null,
            'trailer' => ['key' => 'official123', 'site' => 'YouTube', 'type' => 'Trailer', 'official' => true, 'name' => 'Trailer', 'secret' => 'strip'],
            'cast' => [['tmdb_id' => 1, 'name' => 'Actor', 'character' => null, 'profile_path' => null, 'secret' => 'strip']],
            'directors' => [], 'related' => [], 'token' => 'strip'], 'meta' => ['stale' => false]];
    }

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'internal-test']);
        Http::preventStrayRequests();
    }

    public function test_guest_can_get_safe_allowlisted_media_contract(): void
    {
        Http::fake(['*' => Http::response($this->fixture())]);
        $this->getJson('/api/v1/movies/550/experience')->assertOk()->assertJsonPath('data.trailer.key', 'official123')
            ->assertJsonMissingPath('data.token')->assertJsonMissingPath('data.trailer.secret')->assertJsonMissingPath('data.cast.0.secret');
        Http::assertSent(fn ($r) => $r->url() === 'http://catalog.test/api/internal/v1/movies/550/experience'
            && $r->hasHeader('X-VYBE-Service-Token', 'internal-test'));
    }

    public function test_invalid_key_and_oversized_cast_are_safe_service_errors(): void
    {
        $raw = $this->fixture();
        $raw['data']['trailer']['key'] = 'https://evil.test';
        $large = $this->fixture();
        $large['data']['cast'] = array_fill(0, 13, $large['data']['cast'][0]);
        Http::fakeSequence()->push($raw)->push($large)->pushStatus(503)->push(['code' => 'MOVIE_NOT_FOUND'], 404);
        foreach ([503, 503, 503, 404] as $status) {
            $this->getJson('/api/v1/movies/550/experience')->assertStatus($status)->assertDontSee('internal-test');
        }
    }

    public function test_bad_route_id_is_rejected_before_catalog(): void
    {
        $this->get('/api/v1/movies/01/experience')->assertUnprocessable();
        Http::assertNothingSent();
    }
}
