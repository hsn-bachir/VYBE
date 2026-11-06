import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import type { Access } from '../../auth/hooks/useAccess'
import { AdminNotice, AdminShell } from '../../admin/components/AdminShell'
import { moderationError } from '../api/moderationApi'
import { useModerationActions } from '../hooks/useModeration'
import '../moderation.css'

const names: Record<string, string> = {
  'review.hidden': 'Review hidden', 'review.restored': 'Review restored', 'review.spoiler_set': 'Spoiler protection set',
  'review.spoiler_cleared': 'Spoiler protection removed', 'report.resolved': 'Report resolved', 'report.dismissed': 'Report dismissed',
  'user.created': 'Account created', 'user.updated': 'Account edited', 'user.role_changed': 'Role changed',
  'user.status_changed': 'Status changed', 'user.password_changed': 'Password changed',
  'user.password_reset_initiated': 'Password reset sent', 'user.invitation_resent': 'Invitation resent',
}
export default function ModerationActionsPage() {
  const owner = useAuth().data?.id ?? 0
  const access = useOutletContext<Access>()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const type = params.get('target_type') ?? ''
  const targetId = params.get('target_id') ?? ''
  const query = useModerationActions(owner, page, { ...(type ? { target_type: type } : {}), ...(targetId ? { target_id: targetId } : {}) })
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete('page'); setParams(next) }
  const changePage = (value: number) => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next) }
  return <AdminShell><div className="admin-heading"><div><p className="eyebrow">Accountability</p><h1>Action history</h1><p>Recorded moderation decisions and permitted administrative changes.</p></div></div>
    <div className="admin-filters"><div className="field"><label htmlFor="history-type">Target type</label><select id="history-type" value={type} onChange={event => update('target_type', event.target.value)}><option value="">All permitted actions</option>{access.role === 'admin' && <option value="user">Users</option>}<option value="review">Reviews</option><option value="report">Reports</option></select></div>
      <div className="field"><label htmlFor="history-target">Target ID</label><input id="history-target" type="number" min="1" step="1" value={targetId} onChange={event => update('target_id', event.target.value)} placeholder="Any target" /></div></div>
    {query.isPending ? <div className="admin-table-wrap" role="status" aria-label="Loading action history"><div className="admin-skeleton-row skeleton" /><div className="admin-skeleton-row skeleton" /></div>
      : query.isError ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
        : !query.data?.data.length ? <AdminNotice>No actions match these filters.</AdminNotice>
          : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th><th>Details</th></tr></thead><tbody>{query.data.data.map(action => <tr key={action.id}>
            <td data-label="Date">{new Date(action.created_at).toLocaleString()}</td><td data-label="Actor">{action.actor ? `@${action.actor.username}` : 'Deleted account'}</td>
            <td data-label="Action">{names[action.action] || action.action.replace(/[._]/g, ' ')}</td>
            <td data-label="Target">{action.target_type === 'report' ? <Link to={`/admin/reports/${action.target_id}`}>Report #{action.target_id}</Link> : action.target_type === 'user' && access.role === 'admin' ? <Link to={`/admin/users/${action.target_id}`}>User #{action.target_id}</Link> : `${action.target_type} #${action.target_id}`}</td>
            <td data-label="Reason">{action.reason || '—'}</td><td data-label="Details">{action.details ? Object.entries(action.details).slice(0, 3).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' · ') : '—'}</td>
          </tr>)}</tbody></table></div><div className="admin-pagination"><span>Page {page} of {Math.max(1, query.data.meta.total_pages)}</span><div><Button disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</Button><Button disabled={page >= query.data.meta.total_pages} onClick={() => changePage(page + 1)}>Next</Button></div></div></>}
  </AdminShell>
}
