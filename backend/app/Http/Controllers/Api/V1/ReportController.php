<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reviews\ReportRequest;
use App\Http\Resources\ReportResource;
use App\Services\ModerationService;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    public function store(ReportRequest $request, ModerationService $moderation): JsonResponse
    {
        [$report, $created] = $moderation->report($request->user(), (int) $request->validated('tmdb_id'),
            (int) $request->validated('review_id'), $request->safe()->only(['reason', 'description']));
        return (new ReportResource($report))->response()->setStatusCode($created ? 201 : 200)
            ->header('Cache-Control', 'no-store, private');
    }
}
