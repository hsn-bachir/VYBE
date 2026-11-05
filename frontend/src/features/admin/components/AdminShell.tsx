import { Link } from 'react-router-dom'
import './admin.css'

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <section className="admin-shell">
    <div className="admin-topline"><span className="eyebrow">VYBE / Administration</span><Link to="/admin">Overview</Link><Link to="/admin/users">Users</Link></div>
    {children}
  </section>
}
export function AccountBadge({ value }: { value: string }) {
  return <span className={`admin-badge admin-badge-${value}`}>{value}</span>
}
export function AdminNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={error ? 'admin-notice admin-notice-error' : 'admin-notice'}>{children}</p>
}
