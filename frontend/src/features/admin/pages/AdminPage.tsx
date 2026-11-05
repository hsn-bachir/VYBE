import { Link, useOutletContext } from 'react-router-dom'
import type { Access } from '../../auth/hooks/useAccess'

export default function AdminPage() {
  const access = useOutletContext<Access>()
  const moderator = access.role === 'moderator'
  return <section className="admin-foundation" aria-labelledby="admin-heading">
    <p className="eyebrow">VYBE / {moderator ? 'Moderation' : 'Administration'}</p>
    <h1 id="admin-heading">{moderator ? 'Moderation' : 'Administration'}</h1>
    <p>Your current role is <strong>{moderator ? 'moderator' : 'administrator'}</strong>. {moderator ? 'Moderation tools will appear here as they are implemented.' : 'Manage registered accounts, roles and access from one place.'}</p>
    <div className="admin-landing-actions">{!moderator && <Link className="button primary" to="/admin/users">Manage users</Link>}
      <Link className="button" to="/">Back to movies</Link></div>
  </section>
}
