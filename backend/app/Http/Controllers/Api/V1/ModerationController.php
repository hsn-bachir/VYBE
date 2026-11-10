<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ModerationRequest;
use App\Http\Requests\Admin\MovieSummariesRequest;
use App\Http\Resources\ModerationActionResource;
use App\Http\Resources\ModerationReviewResource;
use App\Http\Resources\ReportResource;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\AdministrativeAction;
use App\Models\Report;
use App\Models\Review;
use App\Models\User;
use App\Services\ModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ModerationController extends Controller
{
    public function __construct(private ModerationService $moderation) {}

    public function overview(ModerationRequest $request): JsonResponse
    {
        $reviews = Review::query()->selectRaw("COUNT(CASE WHEN visibility = 'hidden' THEN 1 END) AS hidden_reviews, COUNT(CASE WHEN moderator_spoiler THEN 1 END) AS enforced_spoilers")->first();
        $reports = Report::query()->selectRaw("COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_reports, COUNT(CASE WHEN status = 'resolved' OR status = 'dismissed' THEN 1 END) AS handled_reports")->first();
        $recent = Report::query()->select(['id', 'target_id', 'reason', 'status', 'created_at'])
            ->orderByDesc('created_at')->orderByDesc('id')->limit(5)->get()->map(fn (Report $report) => [
                'id' => $report->id, 'review_id' => $report->target_id, 'reason' => $report->reason,
                'status' => $report->status, 'created_at' => $report->created_at?->toISOString(),
            ]);
        $data = ['pending_reports' => (int) $reports->pending_reports, 'handled_reports' => (int) $reports->handled_reports,
            'hidden_reviews' => (int) $reviews->hidden_reviews, 'enforced_spoilers' => (int) $reviews->enforced_spoilers,
            'recent_reports' => $recent];
        if ($request->user()->role === User::ROLE_ADMIN) {
            $users = User::query()->selectRaw("COUNT(*) AS total_users, COUNT(CASE WHEN account_status = 'restricted' THEN 1 END) AS restricted_users, COUNT(CASE WHEN account_status = 'banned' THEN 1 END) AS banned_users, COUNT(CASE WHEN account_status = 'deactivated' THEN 1 END) AS deactivated_users")->first();
            $data['users'] = ['total' => (int) $users->total_users, 'restricted' => (int) $users->restricted_users,
                'banned' => (int) $users->banned_users, 'deactivated' => (int) $users->deactivated_users];
        }

        return response()->json(['data' => $data]);
    }

    public function movieSummaries(MovieSummariesRequest $request, MovieCatalogClient $catalog): JsonResponse
    {
        return response()->json($catalog->summaries(array_map('intval', $request->validated('tmdb_ids'))));
    }

    public function reports(ModerationRequest $request): AnonymousResourceCollection
    {
        $query = Report::query()->with(['reporter:id,username', 'review.user:id,username']);
        if ($request->boolean('compact')) {
            $query->with(['review' => fn ($review) => $review
                ->select(['id', 'user_id', 'tmdb_id', 'visibility', 'contains_spoilers', 'moderator_spoiler', 'created_at', 'updated_at'])
                ->selectRaw('SUBSTR(body, 1, 181) AS body')]);
        }
        if ($request->validated('status', 'pending') !== 'all') {
            $query->where('status', $request->validated('status', 'pending'));
        }
        if ($request->filled('target_type')) {
            $query->where('target_type', $request->validated('target_type'));
        }
        if ($request->filled('target_id')) {
            $query->where('target_id', $request->validated('target_id'));
        }

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
        $scope = $request->validated('scope', 'all');
        $query = Review::query()->with('user:id,username');
        if ($request->boolean('compact')) {
            $query->select(['id', 'user_id', 'tmdb_id', 'visibility', 'contains_spoilers', 'moderator_spoiler', 'created_at', 'updated_at'])
                ->selectRaw('SUBSTR(body, 1, 181) AS body');
        }
        $query->withCount(['reports as pending_reports_count' => fn ($q) => $q->where('status', 'pending')]);
        if ($scope === 'needs_attention') {
            $query->whereHas('reports', fn ($q) => $q->where('status', 'pending'));
        }
        if ($scope === 'actioned') {
            $type = $request->validated('actioned_type');
            if ($type === 'hidden') {
                $query->where('visibility', 'hidden');
            } elseif ($type === 'spoiler') {
                $query->where('moderator_spoiler', true);
            } else {
                $query->where(fn ($q) => $q->where('visibility', 'hidden')->orWhere('moderator_spoiler', true));
            }
        }
        if ($request->filled('visibility')) {
            $query->where('visibility', $request->validated('visibility'));
        }
        if ($request->filled('tmdb_id')) {
            $query->where('tmdb_id', $request->validated('tmdb_id'));
        }

        return $this->page($query->orderByDesc('created_at')->orderByDesc('id'), ModerationReviewResource::class, $request);
    }

    public function review(ModerationRequest $request): ModerationReviewResource
    {
        return new ModerationReviewResource(Review::query()->with('user:id,username')
            ->withCount(['reports as pending_reports_count' => fn ($q) => $q->where('status', 'pending')])
            ->findOrFail((int) $request->validated('id')));
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
        if ($request->filled('target_type')) {
            $query->where('target_type', $request->validated('target_type'));
        }
        if ($request->filled('target_id')) {
            $query->where('target_id', $request->validated('target_id'));
        }

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
