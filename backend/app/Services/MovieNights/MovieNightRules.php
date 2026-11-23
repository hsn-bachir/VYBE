<?php

namespace App\Services\MovieNights;

use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\MovieNightMovie;
use Illuminate\Support\Facades\Validator;

class MovieNightRules
{
    public function assertScheduled(MovieNight $night): void
    {
        abort_unless($night->status === MovieNightStatus::Scheduled, 409, 'Movie night is closed.');
    }

    public function assertOpen(MovieNight $night): void
    {
        $this->assertScheduled($night);
        abort_unless($night->votingIsOpen(), 409, 'Voting has closed.');
    }

    public function assertMovie(MovieNight $night, MovieNightMovie $movie): void
    {
        abort_unless($movie->movie_night_id === $night->id, 404, 'Not found.');
    }

    public function assertRemovable(MovieNight $night, MovieNightMovie $movie): void
    {
        $this->assertOpen($night);
        $this->assertMovie($night, $movie);
        abort_if($movie->votes()->exists(), 409, 'Movies with votes cannot be removed.');
    }

    /** Reuse in future create/edit FormRequests. Require an explicit UTC instant. */
    public function eventFields(bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return ['title' => [$required, 'string', 'max:150', 'regex:/\S/u'],
            'starts_at' => [$required, 'date_format:Y-m-d\\TH:i:s\\Z', 'after:now'],
            'timezone' => [$required, 'timezone:all', 'max:64'],
            'location' => ['sometimes', 'nullable', 'string', 'max:500'],
            'meeting_url' => ['sometimes', 'nullable', 'url:https', 'max:2048']];
    }

    public function validateEventFields(array $fields, bool $partial = false): array
    {
        return Validator::make($fields, $this->eventFields($partial))->validate();
    }
}
