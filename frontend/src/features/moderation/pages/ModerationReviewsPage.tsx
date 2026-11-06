import { useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import type { Access } from '../../auth/hooks/useAccess'
import { AccountBadge, AdminNotice, AdminShell } from '../../admin/components/AdminShell'
import { moderationError, type ModerationChange, type ModerationReview, type ReviewFilters } from '../api/moderationApi'
import { AdminMovieFilter } from '../components/AdminMovieFilter'
import { ModerationActionDialog } from '../components/ModerationActionDialog'
import { ReviewInspectDialog } from '../components/ReviewInspectDialog'
import { useModerationChange, useModerationMovieSummaries, useModerationReviews } from '../hooks/useModeration'
import '../moderation.css'

const scopes: { value: NonNullable<ReviewFilters['scope']>; label: string }[] = [
  { value: 'needs_attention', label: 'Needs Attention' }, { value: 'actioned', label: 'Actioned' }, { value: 'all', label: 'All Reviews' },
]
export default function ModerationReviewsPage() {
  const owner = useAuth().data?.id ?? 0
  const access = useOutletContext<Access>()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const scope = scopes.find(item => item.value === params.get('scope'))?.value ?? 'needs_attention'
  const actionedType = params.get('actioned_type') === 'hidden' || params.get('actioned_type') === 'spoiler' ? params.get('actioned_type') as 'hidden' | 'spoiler' : ''
  const tmdbId = params.get('tmdb_id') ?? ''
  const filters: ReviewFilters = { page, per_page: 20, visibility: '', tmdb_id: tmdbId, scope, actioned_type: scope === 'actioned' ? actionedType : '' }
  const query = useModerationReviews(owner, filters)
  const ids = [...(query.data?.data.map(item => item.tmdb_id) ?? []), ...(tmdbId ? [Number(tmdbId)] : [])]
  const titles = useModerationMovieSummaries(owner, ids)
  const title = (id: number) => titles.data?.data.find(movie => movie.tmdb_id === id)?.title || `Movie #${id}`
  const mutation = useModerationChange(owner)
  const [choice, setChoice] = useState<{ review: ModerationReview; kind: 'visibility' | 'spoiler' } | null>(null)
  const [inspecting, setInspecting] = useState<ModerationReview | null>(null)
  const [notice, setNotice] = useState('')
  const active = access.account_status === 'active'
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete('page'); if (key === 'scope') next.delete('actioned_type'); setParams(next) }
  const changePage = (value: number) => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next) }
  const submit = (reason?: string) => {
    if (!choice) return
    const { review, kind } = choice
    const operation: ModerationChange = kind === 'visibility'
      ? { kind, id: review.id, movie: review.tmdb_id, values: { visibility: review.visibility === 'visible' ? 'hidden' : 'visible', ...(reason ? { reason } : {}) } }
      : { kind, id: review.id, movie: review.tmdb_id, values: { moderator_spoiler: !review.moderator_spoiler, ...(reason ? { reason } : {}) } }
    mutation.mutate(operation, { onSuccess: () => { setChoice(null); setNotice('Review moderation change saved.') } })
  }
  return <AdminShell>
    <div className="admin-heading"><div><p className="eyebrow">Community safety</p><h1>Review management</h1><p>Find reports that need a decision, inspect moderated reviews and search all reviews.</p></div></div>
    {notice && <AdminNotice>{notice}</AdminNotice>}
    <div className="moderation-tabs" role="group" aria-label="Review view">{scopes.map(item => <Button key={item.value} className={scope === item.value ? 'primary' : ''} aria-pressed={scope === item.value} onClick={() => update('scope', item.value)}>{item.label}</Button>)}</div>
    <div className="moderation-filters"><AdminMovieFilter selectedId={tmdbId} selectedTitle={tmdbId ? title(Number(tmdbId)) : undefined} onSelect={value => update('tmdb_id', value)} />
      {scope === 'actioned' && <div className="field"><label htmlFor="actioned-type">Moderation state</label><select id="actioned-type" value={actionedType} onChange={event => update('actioned_type', event.target.value)}><option value="">Hidden or spoiler protected</option><option value="hidden">Hidden</option><option value="spoiler">Spoiler protected</option></select></div>}</div>
    {!active && <AdminNotice>Restricted accounts can inspect reviews but cannot change them.</AdminNotice>}
    {query.isPending ? <div className="admin-table-wrap" role="status" aria-label="Loading reviews"><div className="admin-skeleton-row skeleton" /><div className="admin-skeleton-row skeleton" /><div className="admin-skeleton-row skeleton" /></div>
      : query.isError ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
        : !query.data?.data.length ? <AdminNotice>{scope === 'needs_attention' ? 'No reviews need attention right now.' : 'No reviews match these filters.'}</AdminNotice>
          : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Movie</th><th>Review</th><th>Author</th><th>Visibility</th><th>Spoiler</th><th>Reports</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>{query.data.data.map(review => <tr key={review.id}>
            <td data-label="Movie"><Link to={`/movies/${review.tmdb_id}`}>{title(review.tmdb_id)}</Link></td>
            <td data-label="Review" className="admin-review-preview"><button className="admin-text-button" onClick={() => setInspecting(review)}>{review.body_preview || review.body || 'Open review'}</button></td>
            <td data-label="Author">{review.author ? `@${review.author.username}` : 'Deleted account'}</td>
            <td data-label="Visibility"><AccountBadge value={review.visibility} /></td>
            <td data-label="Spoiler">{review.moderator_spoiler ? 'Enforced' : review.author_contains_spoilers ? 'Author marked' : 'No'}</td>
            <td data-label="Reports">{review.pending_report_count ? <Link to={`/admin/reports?target_id=${review.id}`}>{review.pending_report_count} pending</Link> : '—'}</td>
            <td data-label="Submitted">{new Date(review.created_at).toLocaleDateString()}</td>
            <td data-label="Actions"><details className="admin-action-menu"><summary>Actions</summary><div><button onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setInspecting(review) }}>Read review</button><button disabled={!active} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); mutation.reset(); setChoice({ review, kind: 'visibility' }) }}>{review.visibility === 'visible' ? 'Hide review' : 'Restore review'}</button><button disabled={!active} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); mutation.reset(); setChoice({ review, kind: 'spoiler' }) }}>{review.moderator_spoiler ? 'Remove spoiler enforcement' : 'Mark as spoiler'}</button></div></details></td>
          </tr>)}</tbody></table></div><div className="admin-pagination"><span>Page {page} of {Math.max(1, query.data.meta.total_pages)} · {query.data.meta.total_results} reviews</span><div><Button disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</Button><Button disabled={page >= query.data.meta.total_pages} onClick={() => changePage(page + 1)}>Next</Button></div></div></>}
    {inspecting && <ReviewInspectDialog id={inspecting.id} owner={owner} movieTitle={title(inspecting.tmdb_id)} onClose={() => setInspecting(null)} />}
    {choice && <ModerationActionDialog title={choice.kind === 'visibility' ? (choice.review.visibility === 'visible' ? 'Hide review' : 'Restore review') : (choice.review.moderator_spoiler ? 'Remove spoiler enforcement' : 'Mark as spoiler')}
      description="This change is recorded in moderation history." confirmLabel="Confirm change" reasonRequired={choice.kind === 'visibility' && choice.review.visibility === 'visible'} onClose={() => setChoice(null)} onConfirm={submit} pending={mutation.isPending} error={mutation.isError ? mutation.error : null} />}
  </AdminShell>
}
