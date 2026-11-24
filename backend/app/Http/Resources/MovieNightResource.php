<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class MovieNightResource extends MovieNightSummaryResource
{
    public function toArray(Request $request): array
    {
        // Fail closed even if a future adapter passes a membership-only model.
        Gate::forUser($request->user())->authorize('view', $this->resource);

        return parent::toArray($request) + ['location' => $this->location, 'meeting_url' => $this->meeting_url];
    }
}
