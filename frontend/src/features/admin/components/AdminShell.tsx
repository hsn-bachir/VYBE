import { Link, useOutletContext } from 'react-router-dom'
import type { Access } from '../../auth/hooks/useAccess'
import './admin.css'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const access = useOutletContext<Access>()
  return <section className="admin-shell">
    <nav className="admin-topline" aria-label="Administration"><span className="eyebrow">VYBE / {access.role === 'moderator' ? 'Moderation' : 'Administration'}</span><Link to="/admin">Overview</Link>{access.role === 'admin' && <Link to="/admin/users">Users</Link>}<Link to="/admin/reports">Reports</Link><Link to="/admin/reviews">Reviews</Link><Link to="/admin/actions">History</Link></nav>
    {children}
  </section>
}
export function AccountBadge({ value }: { value: string }) {
  return <span className={`admin-badge admin-badge-${value}`}>{value}</span>
}
export function AdminNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={error ? 'admin-notice admin-notice-error' : 'admin-notice'}>{children}</p>
}
