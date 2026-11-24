<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ActivityAnalyticsRequest;
use App\Services\AdminActivityAnalytics;
use App\Services\AdminGenreInsights;
use Illuminate\Http\JsonResponse;

class AdminAnalyticsController extends Controller
{
    public function genres(AdminGenreInsights $insights): JsonResponse
    {
        return response()->json($insights->rankings());
    }

    public function activity(ActivityAnalyticsRequest $request, AdminActivityAnalytics $analytics): JsonResponse
    {
        return response()->json(['data' => $analytics->report((int) $request->validated('range', 30))]);
    }
}
