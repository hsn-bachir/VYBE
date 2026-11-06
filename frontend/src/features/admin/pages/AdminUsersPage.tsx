import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { adminError } from '../api/adminUsersApi'
import type { Access } from '../../auth/hooks/useAccess'
import { useAuth } from '../../auth/hooks/useAuth'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import type { AccountStatus, Role, UserFilters } from '../api/adminUsersApi'
import { AccountBadge, AdminNotice, AdminShell } from '../components/AdminShell'
import { CreateUserDialog } from '../components/CreateUserDialog'
import { useAdminUsers, useCreateAdminUser } from '../hooks/useAdminUsers'

const roles = ['', 'user', 'moderator', 'admin'] as const
const statuses = ['', 'active', 'restricted', 'banned', 'deactivated'] as const
const label = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : 'All'
export default function AdminUsersPage() {
  const access = useOutletContext<Access>()
  const navigate = useNavigate()
  const auth = useAuth()
  const client = useQueryClient()
  const create = useCreateAdminUser(auth.data?.id ?? 0)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState(params.get('q') ?? '')
  const filters: UserFilters = {
    page: Math.max(1, Number(params.get('page')) || 1), per_page: 20, q: params.get('q') ?? '',
    role: roles.includes(params.get('role') as Role) ? params.get('role') as Role : '',
    account_status: statuses.includes(params.get('account_status') as AccountStatus) ? params.get('account_status') as AccountStatus : '',
  }
  useEffect(() => { const timer = window.setTimeout(() => setDraft(filters.q), 0); return () => window.clearTimeout(timer) }, [filters.q])
  useEffect(() => {
    if (draft.trim() === filters.q) return
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params)
      if (draft.trim()) next.set('q', draft.trim()); else next.delete('q')
      next.delete('page'); setParams(next)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [draft, filters.q, params, setParams])
  const query = useAdminUsers(auth.data?.id ?? 0, filters)
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    next.delete('page'); setParams(next)
  }
  const page = (n: number) => { const next = new URLSearchParams(params); next.set('page', String(n)); setParams(next) }
  if (access.role !== 'admin') return <AdminNotice error>Only administrators can manage users.</AdminNotice>
  return <AdminShell>
    <div className="admin-heading"><div><p className="eyebrow">Accounts</p><h1>User Management</h1><p className="text-muted">Manage registered VYBE accounts, permissions and account access.</p></div><Button className="primary" disabled={access.account_status !== 'active'} onClick={() => { setNotice(''); setCreating(true) }}>Create account</Button></div>
    {notice && <AdminNotice>{notice}{createdId && <> <Link to={`/admin/users/${createdId}`}>Open account</Link></>}</AdminNotice>}
    <div className="admin-filters">
      <Input label="Search username or email" id="admin-search" value={draft} onChange={e => setDraft(e.target.value)} placeholder="At least 3 characters" />
      <div className="field"><label htmlFor="admin-role">Role</label><select id="admin-role" value={filters.role} onChange={e => change('role', e.target.value)}>{roles.map(role => <option key={role} value={role}>{role ? `${label(role)}s` : 'All roles'}</option>)}</select></div>
      <div className="field"><label htmlFor="admin-status">Status</label><select id="admin-status" value={filters.account_status} onChange={e => change('account_status', e.target.value)}>{statuses.map(status => <option key={status} value={status}>{status ? label(status) : 'All statuses'}</option>)}</select></div>
    </div>
    {filters.q && filters.q.length < 3 ? <AdminNotice>Enter at least 3 characters to search.</AdminNotice>
      : query.isPending ? <div className="admin-table-wrap" role="status" aria-label="Loading users"><div className="admin-skeleton-row skeleton" /><div className="admin-skeleton-row skeleton" /><div className="admin-skeleton-row skeleton" /></div>
      : query.isError ? <div><AdminNotice error>{adminError(query.error).message}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
      : !query.data?.data.length ? <AdminNotice>No accounts match these filters.</AdminNotice>
      : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead><tbody>
        {query.data.data.map(user => <tr key={user.id} className="admin-clickable-row" onClick={event => { if (!(event.target instanceof Element && event.target.closest('a, button, details, summary'))) navigate(`/admin/users/${user.id}`) }}><td data-label="User"><strong><Link to={`/admin/users/${user.id}`}>@{user.username}</Link></strong><small>#{user.id}{user.invitation_pending ? ' · Invitation pending' : ''}</small></td><td data-label="Email" className="admin-email">{user.email}</td><td data-label="Role"><AccountBadge value={user.role} /></td><td data-label="Status"><AccountBadge value={user.account_status} /></td><td data-label="Joined">{new Date(user.created_at).toLocaleDateString()}</td><td data-label="Actions"><details className="admin-action-menu"><summary>Actions</summary><div><Link to={`/admin/users/${user.id}`}>View details</Link><Link to={`/admin/users/${user.id}`} state={{ action: 'edit' }}>Edit account</Link>{user.role !== 'admin' && <Link to={`/admin/users/${user.id}`} state={{ action: 'role' }}>Change role</Link>}<Link to={`/admin/users/${user.id}`} state={{ action: 'status' }}>{user.account_status === 'active' ? 'Change status' : 'Restore account'}</Link>{!user.invitation_pending && user.role !== 'admin' && <Link to={`/admin/users/${user.id}`} state={{ action: 'password' }}>Manage password</Link>}</div></details></td></tr>)}
      </tbody></table></div><div className="admin-pagination"><span>Page {filters.page} of {query.data.meta.total_pages} · {query.data.meta.total_results} accounts</span><div><Button disabled={filters.page <= 1} onClick={() => page(filters.page - 1)}>Previous</Button><Button disabled={filters.page >= query.data.meta.total_pages} onClick={() => page(filters.page + 1)}>Next</Button></div></div></>}
    {creating && <CreateUserDialog onClose={() => setCreating(false)} pending={create.isPending} onCreate={values => create.mutateAsync(values)} onDone={result => {
      if (client.getQueryData<User | null>(authKey)?.id !== auth.data?.id) return
      setCreating(false); setCreatedId(result.user.id)
      setNotice(result.invitation_delivery === 'accepted' ? `Account ${result.user.username} created. The mail service accepted the invitation.` : `Account ${result.user.username} created, but the invitation could not be sent. Open the account to resend it.`)
    }} />}
  </AdminShell>
}
