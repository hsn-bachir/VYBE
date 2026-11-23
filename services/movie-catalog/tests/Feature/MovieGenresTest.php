<?php

namespace Tests\Feature;

use App\Models\Movie;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MovieGenresTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = '/api/internal/v1/movies/genres';

    private const HEADERS = ['X-VYBE-Service-Token' => 'genre-test'];

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'genre-test']);
        Http::preventStrayRequests();
        Http::fake();
    }

    public function test_returns_only_cached_genres_and_distinguishes_unknown_from_known_empty(): void
    {
        Movie::create(['tmdb_id' => 550, 'title' => 'Detailed movie', 'genres' => [
            ['id' => 18, 'name' => 'Drama', 'ignored' => 'extra'], ['id' => 18, 'name' => 'drama'], ['id' => 53, 'name' => 'Thriller'],
        ]]);
        Movie::create(['tmdb_id' => 551, 'title' => 'Known empty', 'genres' => []]);
        Movie::create(['tmdb_id' => 552, 'title' => 'Summary only']);
        Movie::create(['tmdb_id' => 553, 'title' => 'Invalid stored metadata', 'genres' => [['id' => 1, 'name' => ' ']]]);

        DB::enableQueryLog();
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [552, 550, 550, 551, 553, 554]], self::HEADERS)->assertOk()->assertExactJson([
            'data' => [
                ['tmdb_id' => 552, 'genres' => null],
                ['tmdb_id' => 550, 'genres' => [['id' => 18, 'name' => 'Drama'], ['id' => 53, 'name' => 'Thriller']]],
                ['tmdb_id' => 551, 'genres' => []],
                ['tmdb_id' => 553, 'genres' => null],
                ['tmdb_id' => 554, 'genres' => null],
            ],
        ]);
        $this->assertCount(1, DB::getQueryLog());
        DB::disableQueryLog();
        Http::assertNothingSent();
        $this->assertDatabaseCount('movies', 4);
    }

    public function test_token_is_checked_before_validation_and_batches_are_bounded(): void
    {
        $this->postJson(self::ENDPOINT)->assertForbidden();
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [1]], ['X-VYBE-Service-Token' => 'wrong'])->assertForbidden();
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => array_fill(0, 51, 1)], self::HEADERS)->assertUnprocessable();
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => (object) ['0' => 1]], self::HEADERS)->assertUnprocessable();
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [0, '1', 2147483648]], self::HEADERS)->assertUnprocessable()
            ->assertJsonValidationErrors(['tmdb_ids.0', 'tmdb_ids.1', 'tmdb_ids.2']);
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => range(1, 50)], self::HEADERS)->assertOk()->assertJsonCount(50, 'data');
        Http::assertNothingSent();
    }
}
