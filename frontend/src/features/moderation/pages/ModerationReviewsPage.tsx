import { useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import type { Access } from '../../auth/hooks/useAccess'
import { AccountBadge, AdminNotice, AdminShell } from '../../admin/components/AdminShell'
import { moderationError, type ModerationChange, type ModerationReview } from '../api/moderationApi'
import { ModerationActionDialog } from '../components/ModerationActionDialog'
import { useModerationChange, useModerationReviews } from '../hooks/useModeration'
import '../moderation.css'

export default function ModerationReviewsPage() {
  const auth = useAuth()
  const owner = auth.data?.id ?? 0
  const access = useOutletContext<Access>()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const visibility = params.get('visibility') === 'hidden' || params.get('visibility') === 'visible' ? params.get('visibility') as 'visible' | 'hidden' : ''
  const tmdbId = params.get('tmdb_id') ?? ''
  const query = useModerationReviews(owner, { page, per_page: 20, visibility, tmdb_id: tmdbId })
  const mutation = useModerationChange(owner)
  const [choice, setChoice] = useState<{ review: ModerationReview; kind: 'visibility' | 'spoiler' } | null>(null)
  const [notice, setNotice] = useState('')
  const active = access.account_status === 'active'
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete('page'); setParams(next) }
  const changePage = (value: number) => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next) }
  const submit = (reason: string) => {
    if (!choice) return
    const { review, kind } = choice
    const operation: ModerationChange = kind === 'visibility'
      ? { kind, id: review.id, movie: review.tmdb_id, values: { visibility: review.visibility === 'visible' ? 'hidden' : 'visible', reason } }
      : { kind, id: review.id, movie: review.tmdb_id, values: { moderator_spoiler: !review.moderator_spoiler, reason } }
    mutation.mutate(operation, { onSuccess: () => { setChoice(null); setNotice('Review moderation change saved.') } })
  }
  return <AdminShell><div className="admin-heading"><div><p className="eyebrow">Community safety</p><h1>Review management</h1><p className="text-muted">Inspect published and hidden reviews, then record a reason for changes.</p></div></div>
    {notice && <AdminNotice>{notice}</AdminNotice>}
    <div className="moderation-filters"><div className="field"><label htmlFor="moderation-visibility">Visibility</label><select id="moderation-visibility" value={visibility} onChange={event => update('visibility', event.target.value)}><option value="">All reviews</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></div>
      <div className="field"><label htmlFor="moderation-movie">Movie ID</label><input id="moderation-movie" type="number" min="1" step="1" value={tmdbId} onChange={event => update('tmdb_id', event.target.value)} placeholder="All movies" /></div></div>
    {!active && <AdminNotice>Restricted accounts can inspect reviews but cannot change them.</AdminNotice>}
    {query.isPending ? <AdminNotice>Loading reviews…</AdminNotice> : query.isError ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
      : !query.data?.data.length ? <AdminNotice>No reviews match these filters.</AdminNotice>
        : <><div className="moderation-review-list">{query.data.data.map(review => <article className="admin-panel moderation-review" key={review.id}>
          <div className="moderation-review-heading"><div><p className="eyebrow">Review #{review.id} · <Link to={`/movies/${review.tmdb_id}`}>Movie #{review.tmdb_id}</Link></p><h2>{review.author ? `@${review.author.username}` : 'Deleted account'}</h2></div><AccountBadge value={review.visibility} /></div>
          <p className="moderation-review-body">{review.body}</p><p className="admin-hint">{review.contains_spoilers ? 'Spoiler protected' : 'No spoiler flag'}{review.moderator_spoiler ? ' · Enforced by moderator' : ''} · {new Date(review.created_at).toLocaleDateString()}</p>
          <div className="admin-access-actions"><Button disabled={!active} onClick={() => { mutation.reset(); setChoice({ review, kind: 'visibility' }) }}>{review.visibility === 'visible' ? 'Hide review' : 'Restore review'}</Button>
            <Button disabled={!active} onClick={() => { mutation.reset(); setChoice({ review, kind: 'spoiler' }) }}>{review.moderator_spoiler ? 'Remove spoiler enforcement' : 'Mark as spoiler'}</Button></div>
        </article>)}</div><div className="admin-pagination"><span>Page {page} of {Math.max(1, query.data.meta.total_pages)} · {query.data.meta.total_results} reviews</span><div><Button disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</Button><Button disabled={page >= query.data.meta.total_pages} onClick={() => changePage(page + 1)}>Next</Button></div></div></>}
    {choice && <ModerationActionDialog title={choice.kind === 'visibility' ? (choice.review.visibility === 'visible' ? 'Hide review' : 'Restore review') : (choice.review.moderator_spoiler ? 'Remove spoiler enforcement' : 'Mark as spoiler')} description="A reason is required and this change is recorded in moderation history." confirmLabel="Confirm change" onClose={() => setChoice(null)} onConfirm={submit} pending={mutation.isPending} error={mutation.isError ? mutation.error : null} />}
  </AdminShell>
}
