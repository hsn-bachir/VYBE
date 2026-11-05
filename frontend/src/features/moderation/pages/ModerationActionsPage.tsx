import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { AdminNotice, AdminShell } from '../../admin/components/AdminShell'
import { moderationError } from '../api/moderationApi'
import { useModerationActions } from '../hooks/useModeration'
import '../moderation.css'

export default function ModerationActionsPage() {
  const owner = useAuth().data?.id ?? 0
  const [page, setPage] = useState(1)
  const query = useModerationActions(owner, page)
  return <AdminShell><div className="admin-heading"><div><p className="eyebrow">Accountability</p><h1>Action history</h1><p className="text-muted">Recorded moderation decisions and permitted administrative changes.</p></div></div>
    {query.isPending ? <AdminNotice>Loading actions…</AdminNotice> : query.isError ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
      : !query.data?.data.length ? <AdminNotice>No actions recorded yet.</AdminNotice>
        : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Reason</th><th>When</th></tr></thead><tbody>{query.data.data.map(action => <tr key={action.id}><td data-label="Action">{action.action}</td><td data-label="Target">{action.target_type} #{action.target_id}</td><td data-label="Actor">{action.actor ? `@${action.actor.username}` : 'Deleted account'}</td><td data-label="Reason">{action.reason || '—'}</td><td data-label="When">{new Date(action.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
          <div className="admin-pagination"><span>Page {page} of {Math.max(1, query.data.meta.total_pages)}</span><div><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button disabled={page >= query.data.meta.total_pages} onClick={() => setPage(page + 1)}>Next</Button></div></div></>}
  </AdminShell>
}
