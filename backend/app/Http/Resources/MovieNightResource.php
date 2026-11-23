<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class MovieNightResource extends MovieNightSummaryResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + ['location' => $this->location, 'meeting_url' => $this->meeting_url];
    }
}
