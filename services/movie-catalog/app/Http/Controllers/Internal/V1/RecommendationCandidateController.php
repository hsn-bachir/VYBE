<?php

namespace App\Http\Controllers\Internal\V1;

use App\Http\Requests\Movies\RecommendationCandidatesRequest;
use App\Services\RecommendationCandidateService;

class RecommendationCandidateController
{
    public function __invoke(RecommendationCandidatesRequest $request, RecommendationCandidateService $service)
    {
        return response()->json($service->get($request->validated()));
    }
}
