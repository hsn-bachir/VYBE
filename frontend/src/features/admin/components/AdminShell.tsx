import { Link, NavLink, useOutletContext } from 'react-router-dom'
import type { Access } from '../../auth/hooks/useAccess'
import { Alert } from '../../../components/ui/Alert'
import './admin.css'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const access = useOutletContext<Access>()
  const links = [{ to: '/admin', label: 'Overview', icon: 'overview', end: true },
    ...(access.role === 'admin' ? [{ to: '/admin/users', label: 'Users', icon: 'users', end: false }] : []),
    { to: '/admin/reports', label: 'Reports', icon: 'reports', end: false },
    { to: '/admin/reviews', label: 'Reviews', icon: 'reviews', end: false },
    { to: '/admin/actions', label: 'History', icon: 'history', end: false }]
  const items = links.map(link => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => isActive ? 'active' : undefined}><AdminIcon name={link.icon} />{link.label}</NavLink>)
  return <section className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-sidebar-heading"><p className="eyebrow">VYBE workspace</p><strong>{access.role === 'moderator' ? 'Moderation' : 'Administration'}</strong><span>{access.role}</span></div><nav aria-label="Administration">{items}</nav><Link className="admin-exit" to="/">← Back to VYBE</Link></aside>
    <details className="admin-mobile-menu"><summary>Administration menu</summary><nav aria-label="Administration mobile">{items}<Link to="/">← Back to VYBE</Link></nav></details>
    <div className="admin-main">{children}</div>
  </section>
}
const iconPaths: Record<string, string> = {
  overview: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  reports: 'M12 9v4m0 4h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z',
  reviews: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z',
  history: 'M3 12a9 9 0 1 0 2.6-6.4M3 3v5h5m4-1v5l3 2',
}
function AdminIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>
}
export function AccountBadge({ value }: { value: string }) {
  return <span className={`admin-badge admin-badge-${value}`}>{value}</span>
}
export function AdminNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <Alert variant={error ? 'error' : 'info'}>{children}</Alert>
}
