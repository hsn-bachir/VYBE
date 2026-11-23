<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminMovieInsights;
use Illuminate\Http\JsonResponse;

class AdminMovieInsightsController extends Controller
{
    public function __invoke(AdminMovieInsights $insights): JsonResponse
    {
        return response()->json($insights->rankings());
    }
}
