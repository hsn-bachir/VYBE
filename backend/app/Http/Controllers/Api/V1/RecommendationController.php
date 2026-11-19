<?php

namespace App\Http\Controllers\Api\V1;

use App\Services\Recommendations\RecommendationService;
use Illuminate\Http\Request;

class RecommendationController
{
    public function __invoke(Request $request, RecommendationService $service)
    {
        return response()->json($service->feed($request->user()));
    }
}
