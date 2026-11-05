import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { AccountBadge, AdminNotice, AdminShell } from '../../admin/components/AdminShell'
import { moderationError, type ReportStatus } from '../api/moderationApi'
import { useReports } from '../hooks/useModeration'
import '../moderation.css'

const statuses: ReportStatus[] = ['pending', 'resolved', 'dismissed']
export default function ReportsPage() {
  const owner = useAuth().data?.id ?? 0
  const [params, setParams] = useSearchParams()
  const status = statuses.includes(params.get('status') as ReportStatus) ? params.get('status') as ReportStatus : 'pending'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = useReports(owner, { page, per_page: 20, status })
  const change = (next: URLSearchParams) => setParams(next)
  const setStatus = (value: ReportStatus) => { const next = new URLSearchParams(); next.set('status', value); change(next) }
  const setPage = (value: number) => { const next = new URLSearchParams(params); next.set('page', String(value)); change(next) }
  return <AdminShell><div className="admin-heading"><div><p className="eyebrow">Community safety</p><h1>Reports</h1><p className="text-muted">Review concerns submitted by the VYBE community.</p></div></div>
    <div className="moderation-tabs" role="group" aria-label="Report status">{statuses.map(value => <Button key={value} className={value === status ? 'primary' : ''} aria-pressed={value === status} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</Button>)}</div>
    {query.isPending ? <AdminNotice>Loading reports…</AdminNotice> : query.isError ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
      : !query.data?.data.length ? <AdminNotice>No {status} reports right now.</AdminNotice>
        : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Reported content</th><th>Reason</th><th>Reporter</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {query.data.data.map(item => <tr key={item.id}><td data-label="Content"><strong>{item.target_available && item.review ? `Review for movie #${item.review.tmdb_id}` : 'Review unavailable'}</strong><small>Report #{item.id}</small></td>
            <td data-label="Reason">{item.reason}</td><td data-label="Reporter">{item.reporter ? `@${item.reporter.username}` : 'Deleted account'}</td>
            <td data-label="Submitted">{new Date(item.created_at).toLocaleDateString()}</td><td data-label="Status"><AccountBadge value={item.status} /></td>
            <td data-label="Action"><Link className="button" to={`/admin/reports/${item.id}`}>Investigate</Link></td></tr>)}</tbody></table></div>
          <div className="admin-pagination"><span>Page {page} of {Math.max(1, query.data.meta.total_pages)} · {query.data.meta.total_results} reports</span><div><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button disabled={page >= query.data.meta.total_pages} onClick={() => setPage(page + 1)}>Next</Button></div></div></>}
  </AdminShell>
}
