import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../../../components/ui/Dialog'
import { Button } from '../../../components/ui/Button'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { moderationError, submitReport, type ReportReason } from '../../moderation/api/moderationApi'
import type { Review } from '../types/review.types'
import '../../moderation/moderation.css'

const reasons: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment' }, { value: 'hate', label: 'Hate speech' },
  { value: 'spam', label: 'Spam' }, { value: 'spoiler', label: 'Unmarked spoilers' }, { value: 'other', label: 'Other' },
]
export function ReportReviewDialog({ review, owner, onClose, onDone }: {
  review: Review; owner: number; onClose: () => void; onDone: (created: boolean) => void
}) {
  const client = useQueryClient()
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [description, setDescription] = useState('')
  const [tried, setTried] = useState(false)
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const mutation = useMutation({ retry: false, mutationFn: () => submitReport(review.tmdb_id, review.id,
    { reason: reason as ReportReason, ...(description.trim() ? { description: description.trim() } : {}) }, current),
    onSuccess: result => { if (current()) onDone(result.created) },
  })
  return <Dialog title={`Report review by @${review.author.username}`} onClose={onClose} busy={mutation.isPending} className="report-review-dialog">
    <form onSubmit={event => {
      event.preventDefault(); setTried(true)
      if (!reason || [...description.trim()].length > 1000 || mutation.isPending) return
      mutation.mutate()
    }}>
      <p className="review-dialog-copy">Tell the moderation team what needs attention. Reporting does not automatically remove a review.</p>
      <div className="field"><label htmlFor="report-reason">Why are you reporting this review?</label>
        <select id="report-reason" value={reason} aria-invalid={tried && !reason} onChange={event => setReason(event.target.value as ReportReason | '')} disabled={mutation.isPending}>
          <option value="">Choose a reason</option>{reasons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>{tried && !reason && <p className="field-error" role="alert">Choose a reason.</p>}</div>
      <div className="field"><label htmlFor="report-description">Additional details (optional)</label>
        <textarea id="report-description" value={description} onChange={event => setDescription(event.target.value)} disabled={mutation.isPending} maxLength={1100} rows={4} />
        <p className={[...description.trim()].length > 1000 ? 'field-error' : 'hint'}>{[...description.trim()].length} / 1,000 characters</p></div>
      {mutation.isError && <p role="alert" className="field-error">{moderationError(mutation.error)}</p>}
      <div className="report-dialog-actions"><Button type="button" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
        <Button className="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Submitting…' : 'Submit report'}</Button></div>
    </form>
  </Dialog>
}
