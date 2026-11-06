<?php

namespace App\Services;

use App\Models\AdministrativeAction;
use App\Models\Report;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ModerationService
{
    public function report(User $actor, int $movie, int $reviewId, array $values): array
    {
        try {
            return DB::transaction(function () use ($actor, $movie, $reviewId, $values): array {
                $current = AccountAccess::lock($actor, true);
                $review = Review::query()->whereKey($reviewId)->where('tmdb_id', $movie)
                    ->where('visibility', 'visible')->lockForUpdate()->firstOrFail();
                if ($review->user_id === $current->id) {
                    throw ValidationException::withMessages(['review_id' => ['You cannot report your own review.']]);
                }
                $existing = Report::query()->where('reporter_id', $current->id)->where('target_type', 'review')
                    ->where('target_id', $reviewId)->first();
                if ($existing) return [$existing, false];
                return [Report::query()->create([
                    'reporter_id' => $current->id, 'target_type' => 'review', 'target_id' => $reviewId,
                    'reason' => $values['reason'], 'description' => ($values['description'] ?? '') !== '' ? $values['description'] : null,
                    'status' => 'pending',
                ]), true];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            // The unique index settles a simultaneous duplicate after the first transaction commits.
            $existing = Report::query()->where('reporter_id', $actor->id)->where('target_type', 'review')
                ->where('target_id', $reviewId)->first();
            if ($existing) return [$existing, false];
            throw new \RuntimeException('Unable to confirm report submission.');
        }
    }

    public function resolve(User $actor, int $id, string $action, ?string $reason): Report
    {
        return DB::transaction(function () use ($actor, $id, $action, $reason): Report {
            $current = $this->actor($actor);
            // Review rows are always locked before report rows throughout moderation writes.
            $targetId = Report::query()->whereKey($id)->value('target_id');
            if ($targetId === null) abort(404);
            $review = Review::query()->whereKey($targetId)->lockForUpdate()->first();
            $report = Report::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            if ($report->status === 'resolved' && $report->resolution_action === $action) return $this->loadReport($report);
            if ($report->status !== 'pending') $this->conflict('This report has already been closed.');
            if (! $review || $report->target_type !== 'review' || $review->id !== $report->target_id) {
                $this->conflict('The reported content is no longer available.', 'TARGET_UNAVAILABLE');
            }
            if ($action === 'hide') $review->visibility = 'hidden';
            else $review->moderator_spoiler = true;
            $changed = $review->isDirty();
            $review->save();
            $report->fill(['status' => 'resolved', 'resolved_by' => $current->id, 'resolved_at' => now(),
                'resolution_action' => $action, 'resolution_note' => $reason])->save();
            $this->audit($current, 'report.resolved', 'report', $report->id, $reason,
                ['action' => $action, 'review_id' => $review->id, 'review_changed' => $changed]);
            return $this->loadReport($report);
        }, 3);
    }

    public function dismiss(User $actor, int $id, ?string $reason): Report
    {
        return DB::transaction(function () use ($actor, $id, $reason): Report {
            $current = $this->actor($actor);
            $report = Report::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            if ($report->status === 'dismissed') return $this->loadReport($report);
            if ($report->status !== 'pending') $this->conflict('This report has already been closed.');
            $report->fill(['status' => 'dismissed', 'resolved_by' => $current->id, 'resolved_at' => now(),
                'resolution_action' => null, 'resolution_note' => $reason])->save();
            $this->audit($current, 'report.dismissed', 'report', $report->id, $reason, []);
            return $this->loadReport($report);
        }, 3);
    }

    public function changeReview(User $actor, int $id, string $field, mixed $value, ?string $reason): Review
    {
        return DB::transaction(function () use ($actor, $id, $field, $value, $reason): Review {
            $current = $this->actor($actor);
            $review = Review::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            if ($review->{$field} === $value) return $review->load('user:id,username');
            $review->{$field} = $value;
            $review->save();
            $action = $field === 'visibility' ? ($value === 'hidden' ? 'review.hidden' : 'review.restored')
                : ($value ? 'review.spoiler_set' : 'review.spoiler_cleared');
            $this->audit($current, $action, 'review', $review->id, $reason, ['tmdb_id' => $review->tmdb_id]);
            return $review->load('user:id,username');
        }, 3);
    }

    private function actor(User $actor): User
    {
        $current = AccountAccess::lock($actor, true);
        if (! $current->canModerate()) {
            throw new HttpResponseException(response()->json([
                'message' => 'You do not have permission to access this resource.', 'code' => 'FORBIDDEN',
            ], 403)->header('Cache-Control', 'no-store, private'));
        }
        return $current;
    }

    private function audit(User $actor, string $action, string $type, int $id, ?string $reason, array $details): void
    {
        AdministrativeAction::query()->create(['actor_id' => $actor->id, 'action' => $action,
            'target_type' => $type, 'target_id' => $id, 'reason' => $reason,
            'details' => $details, 'created_at' => now()]);
    }

    private function loadReport(Report $report): Report
    {
        return $report->load(['reporter:id,username', 'review.user:id,username']);
    }

    private function conflict(string $message, string $code = 'CONFLICT'): never
    {
        throw new HttpResponseException(response()->json(['message' => $message, 'code' => $code], 409)
            ->header('Cache-Control', 'no-store, private'));
    }
}
