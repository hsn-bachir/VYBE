import { NavLink, useOutletContext } from 'react-router-dom'
import type { Access } from '../../auth/hooks/useAccess'
import './admin.css'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const access = useOutletContext<Access>()
  const links = [{ to: '/admin', label: 'Overview', end: true },
    ...(access.role === 'admin' ? [{ to: '/admin/users', label: 'Users', end: false }] : []),
    { to: '/admin/reports', label: 'Reports', end: false },
    { to: '/admin/reviews', label: 'Reviews', end: false },
    { to: '/admin/actions', label: 'History', end: false }]
  const items = links.map(link => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => isActive ? 'active' : undefined}>{link.label}</NavLink>)
  return <section className="admin-shell">
    <aside className="admin-sidebar"><p className="eyebrow">VYBE / {access.role === 'moderator' ? 'Moderation' : 'Administration'}</p><nav aria-label="Administration">{items}</nav></aside>
    <details className="admin-mobile-menu"><summary>Administration menu</summary><nav aria-label="Administration mobile">{items}</nav></details>
    <div className="admin-main">{children}</div>
  </section>
}
export function AccountBadge({ value }: { value: string }) {
  return <span className={`admin-badge admin-badge-${value}`}>{value}</span>
}
export function AdminNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={error ? 'admin-notice admin-notice-error' : 'admin-notice'}>{children}</p>
}
