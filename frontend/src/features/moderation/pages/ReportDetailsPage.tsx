import { SectionSkeleton } from '../../../components/ui/SectionSkeleton'
import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import type { Access } from '../../auth/hooks/useAccess'
import { AccountBadge, AdminNotice, AdminShell } from '../../admin/components/AdminShell'
import { moderationError, type ModerationChange } from '../api/moderationApi'
import { ModerationActionDialog } from '../components/ModerationActionDialog'
import { useModerationChange, useModerationMovieSummaries, useReport } from '../hooks/useModeration'
import '../moderation.css'

type Choice = 'hide' | 'mark_spoiler' | 'dismiss'
export default function ReportDetailsPage() {
  const auth = useAuth()
  const owner = auth.data?.id ?? 0
  const access = useOutletContext<Access>()
  const id = Number(useParams().id)
  const query = useReport(owner, id)
  const movies = useModerationMovieSummaries(owner, query.data?.review ? [query.data.review.tmdb_id] : [])
  const change = useModerationChange(owner)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [notice, setNotice] = useState('')
  const active = access.account_status === 'active'
  const item = query.data
  const submit = (reason?: string) => {
    if (!choice || !item) return
    const operation: ModerationChange = choice === 'dismiss' ? { kind: 'dismiss', id: item.id, values: { reason } }
      : { kind: 'resolve', id: item.id, movie: item.review?.tmdb_id, values: { action: choice, reason } }
    change.mutate(operation, { onSuccess: () => { setChoice(null); setNotice('Decision saved and recorded in moderation history.') } })
  }
  return <AdminShell><Link className="admin-back" to="/admin/reports">← Back to reports</Link>
    {query.isPending ? <SectionSkeleton label="Loading report" rows={5} /> : query.isError || !item ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
      : <><div className="admin-heading"><div><p className="eyebrow">Reported review / #{item.id}</p><h1>Investigate report</h1><p className="text-muted">Submitted {new Date(item.created_at).toLocaleString()}</p></div><AccountBadge value={item.status} /></div>
        {notice && <AdminNotice>{notice}</AdminNotice>}
        <div className="admin-detail-grid"><section className="admin-panel"><h2>Report</h2><dl><dt>Reason</dt><dd>{item.reason}</dd><dt>Reporter</dt><dd>{item.reporter ? `@${item.reporter.username}` : 'Deleted account'}</dd><dt>Details</dt><dd>{item.description || 'No additional details.'}</dd><dt>Status</dt><dd>{item.status}</dd>{item.resolved_at && <><dt>Decision</dt><dd>{item.resolution_action || 'Dismissed'} by user #{item.resolved_by ?? 'deleted'}</dd><dt>Note</dt><dd>{item.resolution_note}</dd></>}</dl></section>
          <section className="admin-panel"><h2>Reported review</h2>{item.target_available && item.review ? <><p><Link to={`/movies/${item.review.tmdb_id}`}>{movies.data?.data.find(movie => movie.tmdb_id === item.review?.tmdb_id)?.title || `Movie #${item.review.tmdb_id}`}</Link> · by {item.review.author ? `@${item.review.author.username}` : 'Deleted account'}</p><p><AccountBadge value={item.review.visibility} /> {item.review.contains_spoilers ? 'Spoiler protected' : 'No spoiler flag'}</p><p className="moderation-review-body">{item.review.body}</p></> : <p>This review is no longer available. You can dismiss its report.</p>}</section></div>
        {item.status === 'pending' && <div className="admin-access-actions"><Button disabled={!active || !item.target_available} onClick={() => { change.reset(); setChoice('mark_spoiler') }}>Mark as spoiler</Button><Button disabled={!active || !item.target_available} onClick={() => { change.reset(); setChoice('hide') }}>Hide review</Button><Button disabled={!active} onClick={() => { change.reset(); setChoice('dismiss') }}>Dismiss report</Button></div>}
        {!active && <AdminNotice>Restricted accounts can inspect reports but cannot make moderation changes.</AdminNotice>}
      </>}
    {choice && item && <ModerationActionDialog title={choice === 'dismiss' ? 'Dismiss report' : choice === 'hide' ? 'Hide review and resolve report' : 'Mark spoiler and resolve report'} description="This decision is recorded in moderation history." confirmLabel={choice === 'dismiss' ? 'Dismiss report' : 'Confirm decision'} reasonRequired={choice === 'hide'} onClose={() => setChoice(null)} onConfirm={submit} pending={change.isPending} error={change.isError ? change.error : null} />}
  </AdminShell>
}
