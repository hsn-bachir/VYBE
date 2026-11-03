import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { reviewError } from '../api/reviewsApi'

export function DeleteReviewDialog({ pending, error, onClose, onDelete }: { pending: boolean; error: unknown; onClose: () => void; onDelete: () => void }) {
  return <Dialog title="Delete your review?" onClose={onClose} busy={pending} className="review-delete-dialog">
    <p className="review-dialog-copy">Your review will be permanently deleted. This cannot be undone. Your rating, Watchlist, Watched and Collections stay unchanged.</p>
    {Boolean(error) && <p className="form-error" role="alert">{reviewError(error)}</p>}
    <div className="review-editor-actions"><Button autoFocus disabled={pending} onClick={onClose}>Keep review</Button><Button className="review-danger" disabled={pending} onClick={onDelete}>{pending ? 'Deleting…' : 'Delete review'}</Button></div>
  </Dialog>
}
