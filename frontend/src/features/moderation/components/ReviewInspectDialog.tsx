import { SectionSkeleton } from '../../../components/ui/SectionSkeleton'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { moderationError } from '../api/moderationApi'
import { useModerationReview } from '../hooks/useModeration'
import { AccountBadge } from '../../admin/components/AdminShell'

export function ReviewInspectDialog({ id, owner, movieTitle, onClose }: { id: number; owner: number; movieTitle?: string; onClose: () => void }) {
  const query = useModerationReview(owner, id)
  const review = query.data
  return <Dialog title={`Review #${id}`} onClose={onClose} className="admin-review-dialog">
    {query.isPending ? <SectionSkeleton label="Loading review" /> : query.isError || !review ? <div role="alert"><p>{moderationError(query.error)}</p><Button onClick={() => void query.refetch()}>Retry</Button></div>
      : <><p className="admin-hint"><Link to={`/movies/${review.tmdb_id}`} onClick={onClose}>{movieTitle || `Movie #${review.tmdb_id}`}</Link> · {review.author ? `@${review.author.username}` : 'Deleted account'} · {new Date(review.created_at).toLocaleString()}</p>
        <p><AccountBadge value={review.visibility} /> {review.contains_spoilers ? 'Spoiler protected' : 'No spoiler flag'} · {review.pending_report_count ?? 0} pending reports</p>
        <p className="moderation-review-body">{review.body}</p>
        {review.pending_report_count ? <Link to={`/admin/reports?target_id=${review.id}`} onClick={onClose}>Review pending reports</Link> : null}
      </>}
  </Dialog>
}
