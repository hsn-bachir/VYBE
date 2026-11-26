<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieNightDashboardPartitionTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/api/v1/me/movie-nights';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
    }

    private function signIn(User $actor): void
    {
        Auth::forgetGuards();
        $this->actingAs($actor, 'web');
    }

    private function event(User $host, MovieNightStatus $status = MovieNightStatus::Scheduled, int $seconds = 86400): MovieNight
    {
        $night = new MovieNight(['title' => 'Partition fixture', 'starts_at' => now()->addSeconds($seconds),
            'timezone' => 'Asia/Beirut', 'location' => 'PRIVATE location', 'meeting_url' => 'https://example.test/private']);
        $night->host()->associate($host);
        $night->forceFill(['status' => $status, 'cancelled_at' => $status === MovieNightStatus::Cancelled ? now() : null,
            'finalized_at' => $status === MovieNightStatus::Finalized ? now() : null,
            'finalized_tmdb_id' => $status === MovieNightStatus::Finalized ? 550 : null])->save();

        return $night;
    }

    private function invite(MovieNight $night, User $actor, MovieNightRsvp $rsvp): MovieNightInvitation
    {
        $invitation = new MovieNightInvitation(['rsvp_status' => $rsvp, 'responded_at' => $rsvp === MovieNightRsvp::Pending ? null : now()]);
        $invitation->movieNight()->associate($night);
        $invitation->invitedUser()->associate($actor);
        $invitation->save();

        return $invitation;
    }

    public function test_partition_filters_before_pagination_with_exact_totals_and_stable_order(): void
    {
        $actor = User::factory()->create();
        $host = User::factory()->create();
        $mine = $inbox = [];
        for ($i = 0; $i < 12; $i++) {
            $night = $this->event($i % 4 === 0 ? $actor : $host, seconds: 86400 - $i);
            if ($i % 4 === 0) {
                $mine[] = $night->id;
            } else {
                $rsvp = [1 => MovieNightRsvp::Accepted, 2 => MovieNightRsvp::Pending, 3 => MovieNightRsvp::Declined][$i % 4];
                $this->invite($night, $actor, $rsvp);
                if ($rsvp === MovieNightRsvp::Accepted) {
                    $mine[] = $night->id;
                } else {
                    $inbox[] = $night->id;
                }
            }
            // Another person's acceptance must not admit this actor to My Movie Nights.
            $this->invite($night, User::factory()->create(), MovieNightRsvp::Accepted);
        }
        $hidden = $this->event($host);
        $this->signIn($actor);
        $actualMine = $actualInbox = [];
        for ($page = 1; $page <= 3; $page++) {
            $list = $this->getJson(self::BASE.'?per_page=2&page='.$page)->assertOk()->assertJsonCount(2, 'data')
                ->assertJsonPath('meta', ['page' => $page, 'per_page' => 2, 'total_pages' => 3, 'total_results' => 6]);
            $received = $this->getJson(self::BASE.'/invitations?per_page=2&page='.$page)->assertOk()->assertJsonCount(2, 'data')
                ->assertJsonPath('meta', ['page' => $page, 'per_page' => 2, 'total_pages' => 3, 'total_results' => 6]);
            foreach ($list->json('data') as $entry) {
                $this->assertSame('accepted', $entry['my_rsvp']);
                $this->assertArrayNotHasKey('location', $entry);
                $this->assertArrayNotHasKey('meeting_url', $entry);
                $actualMine[] = $entry['id'];
            }
            foreach ($received->json('data') as $entry) {
                $this->assertContains($entry['rsvp_status'], ['pending', 'declined']);
                $this->assertSame($actor->id, $entry['participant']['id']);
                $this->assertSame(['id', 'title', 'host', 'starts_at', 'timezone', 'status', 'my_rsvp'], array_keys($entry['movie_night']));
                $actualInbox[] = $entry['movie_night']['id'];
            }
        }
        $this->assertSame(array_reverse($mine), $actualMine);
        $this->assertSame($inbox, $actualInbox);
        $this->assertSame([], array_values(array_intersect($actualMine, $actualInbox)));
        $this->getJson(self::BASE.'?page=4&per_page=2')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 6);
        $this->getJson(self::BASE.'/invitations?page=4&per_page=2')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 6);
        $this->getJson(self::BASE.'/'.$hidden->id)->assertNotFound();
        Http::assertNothingSent();
    }

    public static function lifecycleAccounts(): array
    {
        $cases = [];
        foreach (['active', 'restricted'] as $account) {
            foreach (['scheduled', 'cancelled', 'finalized'] as $status) {
                foreach ([-1, 0, 1] as $seconds) {
                    $cases[] = [$account, $status, $seconds];
                }
            }
        }

        return $cases;
    }

    #[DataProvider('lifecycleAccounts')]
    public function test_partition_keeps_terminal_and_expired_reads_and_preserves_lifecycle_filters(string $account, string $status, int $seconds): void
    {
        $actor = User::factory()->create(['account_status' => $account]);
        $host = User::factory()->create();
        $state = MovieNightStatus::from($status);
        $hosted = $this->event($actor, $state, $seconds);
        $accepted = $this->event($host, $state, $seconds);
        $this->invite($accepted, $actor, MovieNightRsvp::Accepted);
        $pending = $this->event($host, $state, $seconds);
        $this->invite($pending, $actor, MovieNightRsvp::Pending);
        $declined = $this->event($host, $state, $seconds);
        $this->invite($declined, $actor, MovieNightRsvp::Declined);
        // Unfiltered membership remains broad for RSVP; collection filtering must not replace it.
        $this->assertSame(4, MovieNight::query()->forMember($actor)->count());
        $this->signIn($actor);
        $this->getJson(self::BASE.'?status='.$status)->assertOk()->assertJsonPath('meta.total_results', 2)
            ->assertJsonPath('data.0.id', $hosted->id)->assertJsonPath('data.1.id', $accepted->id);
        $other = $status === 'scheduled' ? 'cancelled' : 'scheduled';
        $this->getJson(self::BASE.'?status='.$other)->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
        $this->getJson(self::BASE.'/invitations')->assertOk()->assertJsonPath('meta.total_results', 2)
            ->assertJsonPath('data.0.movie_night.id', $pending->id)->assertJsonPath('data.1.movie_night.id', $declined->id);
        $this->getJson(self::BASE.'/'.$pending->id)->assertNotFound();
        $this->getJson(self::BASE.'/'.$declined->id)->assertNotFound();
        $this->getJson(self::BASE.'/'.$accepted->id)->assertOk();
        if ($account === 'restricted' || $status !== 'scheduled' || $seconds <= 0) {
            $expected = $account === 'restricted' ? 403 : 409;
            $this->putJson(self::BASE.'/'.$pending->id.'/rsvp', ['rsvp_status' => 'accepted'])->assertStatus($expected);
            $this->putJson(self::BASE.'/'.$accepted->id.'/rsvp', ['rsvp_status' => 'declined'])->assertStatus($expected);
            $this->getJson(self::BASE)->assertOk()->assertJsonPath('meta.total_results', 2);
            $this->getJson(self::BASE.'/invitations')->assertOk()->assertJsonPath('meta.total_results', 2);
        }
        Http::assertNothingSent();
    }

    public function test_rsvp_moves_collections_without_deleting_invitation_or_restoring_votes(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $night = $this->event($host);
        $invitation = $this->invite($night, $guest, MovieNightRsvp::Pending);
        $candidate = new MovieNightMovie(['tmdb_id' => 550]);
        $candidate->movieNight()->associate($night);
        $candidate->nominatedBy()->associate($host);
        $candidate->save();
        $this->signIn($host);
        $this->putJson(self::BASE.'/'.$night->id.'/vote', ['movie_night_movie_id' => $candidate->id])->assertOk();
        $this->signIn($guest);
        foreach (['accepted', 'declined', 'accepted'] as $status) {
            $this->putJson(self::BASE.'/'.$night->id.'/rsvp', ['rsvp_status' => $status])->assertOk();
            $this->getJson(self::BASE)->assertOk()->assertJsonCount($status === 'accepted' ? 1 : 0, 'data');
            $this->getJson(self::BASE.'/invitations')->assertOk()->assertJsonCount($status === 'accepted' ? 0 : 1, 'data');
            $this->assertDatabaseHas('movie_night_invitations', ['id' => $invitation->id, 'rsvp_status' => $status]);
            if ($status === 'accepted') {
                $this->getJson(self::BASE.'/'.$night->id.'/votes')->assertOk()->assertJsonPath('data.my_vote', null)->assertJsonPath('data.total_votes', 1);
                $this->putJson(self::BASE.'/'.$night->id.'/vote', ['movie_night_movie_id' => $candidate->id])->assertOk();
            } else {
                $this->assertDatabaseMissing('movie_night_votes', ['movie_night_id' => $night->id, 'voting_user_id' => $guest->id]);
                $this->getJson(self::BASE.'/'.$night->id)->assertNotFound();
            }
        }
        $this->signIn($host);
        $this->getJson(self::BASE.'/'.$night->id.'/invitations')->assertOk()->assertJsonPath('data.0.rsvp_status', 'accepted');
        Http::assertNothingSent();
    }

    public function test_accepting_the_last_inbox_item_shrinks_pages_on_the_server(): void
    {
        $guest = User::factory()->create();
        $host = User::factory()->create();
        for ($i = 0; $i < 3; $i++) {
            $last = $this->event($host);
            $this->invite($last, $guest, MovieNightRsvp::Pending);
        }
        $this->signIn($guest);
        $this->getJson(self::BASE.'/invitations?per_page=2&page=2')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total_pages', 2);
        $this->putJson(self::BASE.'/'.$last->id.'/rsvp', ['rsvp_status' => 'accepted'])->assertOk();
        $this->getJson(self::BASE.'/invitations?per_page=2&page=2')->assertOk()->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.total_results', 2)->assertJsonPath('meta.total_pages', 1);
        $this->getJson(self::BASE)->assertOk()->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $last->id);
    }
}
