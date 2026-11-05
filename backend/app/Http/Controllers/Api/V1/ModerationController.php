<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ModerationRequest;
use App\Http\Resources\ModerationActionResource;
use App\Http\Resources\ModerationReviewResource;
use App\Http\Resources\ReportResource;
use App\Models\AdministrativeAction;
use App\Models\Report;
use App\Models\Review;
use App\Models\User;
use App\Services\ModerationService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ModerationController extends Controller
{
    public function __construct(private ModerationService $moderation) {}

    public function reports(ModerationRequest $request): AnonymousResourceCollection
    {
        $query = Report::query()->with(['reporter:id,username', 'review.user:id,username'])
            ->where('status', $request->validated('status', 'pending'));
        if ($request->filled('target_type')) $query->where('target_type', $request->validated('target_type'));
        return $this->page($query->orderBy('created_at')->orderBy('id'), ReportResource::class, $request);
    }

    public function report(ModerationRequest $request): ReportResource
    {
        return new ReportResource(Report::query()->with(['reporter:id,username', 'review.user:id,username'])
            ->findOrFail((int) $request->validated('id')));
    }

    public function resolve(ModerationRequest $request): ReportResource
    {
        return new ReportResource($this->moderation->resolve($request->user(), (int) $request->validated('id'),
            $request->validated('action'), $request->validated('reason')));
    }

    public function dismiss(ModerationRequest $request): ReportResource
    {
        return new ReportResource($this->moderation->dismiss($request->user(), (int) $request->validated('id'),
            $request->validated('reason')));
    }

    public function reviews(ModerationRequest $request): AnonymousResourceCollection
    {
        $query = Review::query()->with('user:id,username');
        if ($request->filled('visibility')) $query->where('visibility', $request->validated('visibility'));
        if ($request->filled('tmdb_id')) $query->where('tmdb_id', $request->validated('tmdb_id'));
        return $this->page($query->orderByDesc('created_at')->orderByDesc('id'), ModerationReviewResource::class, $request);
    }

    public function visibility(ModerationRequest $request): ModerationReviewResource
    {
        return new ModerationReviewResource($this->moderation->changeReview($request->user(),
            (int) $request->validated('id'), 'visibility', $request->validated('visibility'), $request->validated('reason')));
    }

    public function spoiler(ModerationRequest $request): ModerationReviewResource
    {
        return new ModerationReviewResource($this->moderation->changeReview($request->user(),
            (int) $request->validated('id'), 'moderator_spoiler', $request->validated('moderator_spoiler'), $request->validated('reason')));
    }

    public function actions(ModerationRequest $request): AnonymousResourceCollection
    {
        $query = AdministrativeAction::query()->with('actor:id,username');
        if ($request->user()->role !== User::ROLE_ADMIN) {
            $query->whereIn('action', ['review.hidden', 'review.restored', 'review.spoiler_set',
                'review.spoiler_cleared', 'report.resolved', 'report.dismissed'])
                ->whereIn('target_type', ['review', 'report']);
        }
        if ($request->filled('target_type')) $query->where('target_type', $request->validated('target_type'));
        if ($request->filled('target_id')) $query->where('target_id', $request->validated('target_id'));
        return $this->page($query->orderByDesc('created_at')->orderByDesc('id'), ModerationActionResource::class, $request);
    }

    private function page($query, string $resource, ModerationRequest $request): AnonymousResourceCollection
    {
        $page = (int) $request->validated('page', 1);
        $perPage = (int) $request->validated('per_page', 20);
        $rows = $query->paginate($perPage, ['*'], 'page', $page);
        return $resource::collection($rows->items())->additional(['meta' => [
            'page' => $page, 'per_page' => $perPage, 'total_pages' => $rows->lastPage(), 'total_results' => $rows->total(),
        ]]);
    }
}
