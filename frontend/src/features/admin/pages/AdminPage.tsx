import { Link, useOutletContext } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import type { Access } from '../../auth/hooks/useAccess'
import { useAuth } from '../../auth/hooks/useAuth'
import { moderationError } from '../../moderation/api/moderationApi'
import { useAdminOverview } from '../../moderation/hooks/useModeration'
import { AccountBadge, AdminNotice, AdminShell } from '../components/AdminShell'

type Stat = { label: string; value: number; path?: string }

function StatGrid({ stats }: { stats: Stat[] }) {
  return <div className="admin-stats">{stats.map(({ label, value, path }) => {
    const content = <><strong>{value.toLocaleString()}</strong><span>{label}</span></>
    return path ? <Link className="admin-stat" key={label} to={path}>{content}</Link>
      : <div className="admin-stat" key={label}>{content}</div>
  })}</div>
}

function StatSkeletons({ count, label }: { count: number; label: string }) {
  return <div className="admin-stats" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, index) => <div key={index} className="admin-stat skeleton" aria-hidden="true" />)}
  </div>
}

export default function AdminPage() {
  const access = useOutletContext<Access>()
  const query = useAdminOverview(useAuth().data?.id ?? 0)
  const moderator = access.role === 'moderator'
  const data = query.data
  const users = moderator ? undefined : data?.users
  const activity = moderator ? undefined : data?.activity
  const totals: Stat[] = [
    ...(users ? [{ label: 'Total users', value: users.total, path: '/admin/users' }] : []),
    ...(activity ? [
      { label: 'Total reviews', value: activity.total_reviews },
      { label: 'Total VYBE ratings', value: activity.total_ratings },
      { label: 'Total watched entries', value: activity.total_watched_entries },
    ] : []),
  ]
  const stats = data ? [
    { label: 'Pending reports', value: data.pending_reports, path: '/admin/reports' },
    { label: 'Hidden reviews', value: data.hidden_reviews, path: '/admin/reviews?scope=actioned&actioned_type=hidden' },
    { label: 'Spoiler protected', value: data.enforced_spoilers, path: '/admin/reviews?scope=actioned&actioned_type=spoiler' },
    { label: 'Handled reports', value: data.handled_reports, path: '/admin/reports?status=resolved' },
    ...(users ? [
      { label: 'Restricted users', value: users.restricted, path: '/admin/users?account_status=restricted' },
      { label: 'Banned users', value: users.banned, path: '/admin/users?account_status=banned' },
      { label: 'Deactivated users', value: users.deactivated, path: '/admin/users?account_status=deactivated' },
    ] : []),
  ] : []
  return <AdminShell>
    <div className="admin-heading"><div><p className="eyebrow">Community operations</p><h1>{moderator ? 'Moderation overview' : 'Administration'}</h1><p>{moderator ? 'Accounts, reports and review safety in one place.' : 'Platform statistics, account status and moderation.'}</p></div></div>
    {query.isPending ? <>
      {!moderator && <StatSkeletons count={4} label="Loading platform totals" />}
      <StatSkeletons count={moderator ? 4 : 7} label="Loading administration summary" />
    </>
      : query.isError ? <div><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
        : <>
          {totals.length > 0 && <>
            <section className="admin-platform-totals" aria-labelledby="admin-platform-totals"><div className="admin-section-heading"><h2 id="admin-platform-totals">Platform totals</h2></div><StatGrid stats={totals} /></section>
            <div className="admin-section-heading"><h2>Moderation and account status</h2></div>
          </>}
          <StatGrid stats={stats} />
          <div className="admin-section-heading"><h2>Recent reports</h2><Link to="/admin/reports">Open queue</Link></div>
          {data?.recent_reports.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Review</th><th>Reason</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>{data.recent_reports.map(item => <tr key={item.id}>
            <td data-label="Review">Review #{item.review_id}</td><td data-label="Reason">{item.reason}</td><td data-label="Status"><AccountBadge value={item.status} /></td><td data-label="Submitted">{new Date(item.created_at).toLocaleDateString()}</td><td data-label="Action"><Link to={`/admin/reports/${item.id}`}>Inspect</Link></td>
          </tr>)}</tbody></table></div> : <AdminNotice>No reports have been submitted.</AdminNotice>}
        </>}
    <div className="admin-section-heading"><h2>Quick actions</h2></div><div className="admin-quick-links">{!moderator && <Link className="button" to="/admin/users">Manage users</Link>}<Link className="button" to="/admin/reports">Review reports</Link><Link className="button" to="/admin/reviews">Manage reviews</Link></div>
  </AdminShell>
}
