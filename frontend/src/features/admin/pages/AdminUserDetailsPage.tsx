import { useState, type FormEvent } from 'react'
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Input } from '../../../components/ui/Input'
import { adminError } from '../api/adminUsersApi'
import { authKey, useAuth } from '../../auth/hooks/useAuth'
import type { Access } from '../../auth/hooks/useAccess'
import type { User } from '../../auth/types/auth.types'
import type { AccountStatus, AdminUser, UserChange } from '../api/adminUsersApi'
import { AccountBadge, AdminNotice, AdminShell } from '../components/AdminShell'
import { PasswordManagementDialog } from '../components/PasswordManagementDialog'
import { useModerationActions } from '../../moderation/hooks/useModeration'
import { useAdminUser, useAdminUserChange, useChangeAdminPassword, useResendAdminInvitation, useSendAdminPasswordReset } from '../hooks/useAdminUsers'
import { useAdminIdentityMethods } from '../hooks/useAdminUsers'
import { freshFirebaseIdentityToken } from '../../auth/api/firebaseSocial'

type Mode = 'edit' | 'role' | 'status'
const statuses: AccountStatus[] = ['active', 'restricted', 'banned', 'deactivated']
function ChangeDialog({ mode, user, onClose, onDone, change, pending, adminEmail }: {
  mode: Mode; user: AdminUser; onClose: () => void; onDone: (message: string) => void
  change: (value: UserChange) => Promise<AdminUser>; pending: boolean; adminEmail?: string
}) {
  const firebaseMode = import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase'
  const [method, setMethod] = useState<'password' | 'google.com' | 'github.com'>('password')
  const [adminPassword, setAdminPassword] = useState('')
  const [username, setUsername] = useState(user.username)
  const [email, setEmail] = useState(user.email)
  const [role, setRole] = useState<'user' | 'moderator'>(user.role === 'moderator' ? 'user' : 'moderator')
  const [status, setStatus] = useState<AccountStatus>(user.account_status === 'active' ? 'restricted' : 'active')
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setFailure(''); setFields({})
    try {
      const emailChanged = email.trim().toLowerCase() !== user.email
      const adminIdToken = mode === 'edit' && emailChanged && firebaseMode
        ? await freshFirebaseIdentityToken(method, adminEmail ?? '', adminPassword) : undefined
      const operation: UserChange = mode === 'edit' ? { kind: 'edit', id: user.id, values: {
        username,
        ...(emailChanged ? { email, ...(adminIdToken ? { admin_id_token: adminIdToken } : {}) } : {}),
      } }
        : mode === 'role' ? { kind: 'role', id: user.id, values: { role } }
          : { kind: 'status', id: user.id, values: { account_status: status, ...(status !== 'active' ? { reason: reason.trim() } : {}) } }
      await change(operation)
      onDone(mode === 'edit' ? 'Account details saved.' : mode === 'role' ? 'Role updated.' : 'Account status updated.')
    } catch (error) {
      const detail = adminError(error)
      setFailure(detail.message); setFields(detail.fields)
    }
  }
  const title = mode === 'edit' ? 'Edit account' : mode === 'role' ? 'Change role' : 'Change account status'
  return <Dialog title={title} onClose={onClose} busy={pending}>
    <p className="text-muted">{user.username} · Account #{user.id}</p>
    <form onSubmit={event => void submit(event)}>
      {mode === 'edit' ? <>
        <Input label="Username" name="username" value={username} onChange={e => setUsername(e.target.value)} error={fields.username?.[0]} maxLength={30} required />
        <Input label="Email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} error={fields.email?.[0]} maxLength={255} required />
        {email.trim().toLowerCase() !== user.email && <p className="admin-hint">Changing email clears verification and signs out this account until it verifies the new address.</p>}
        {firebaseMode && email.trim().toLowerCase() !== user.email && <><div className="field"><label htmlFor="email-confirm-method">Confirm your identity with</label><select id="email-confirm-method" value={method} onChange={e => setMethod(e.target.value as typeof method)}><option value="password">Email and password</option><option value="google.com">Google</option><option value="github.com">GitHub</option></select></div>{method === 'password' && <Input label="Your administrator password" name="admin_password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoComplete="current-password" required />}</>}
      </> : mode === 'role' ? <div className="field"><label htmlFor="change-role">New role</label><select id="change-role" value={role} onChange={e => setRole(e.target.value as 'user' | 'moderator')}><option value="user">User</option><option value="moderator">Moderator</option></select></div>
        : <><div className="field"><label htmlFor="change-status">New status</label><select id="change-status" value={status} onChange={e => setStatus(e.target.value as AccountStatus)}>{statuses.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></div><p className="admin-hint">{status === 'active' ? 'Restoring access allows this account to sign in again.' : status === 'restricted' ? 'The account keeps personal library access but cannot write community content.' : 'The account loses authenticated VYBE access. Existing movies and reviews remain.'}</p></>}
      {mode === 'status' && status !== 'active' && <div className="field"><label htmlFor="change-reason">Reason for account sanction</label><textarea id="change-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} required aria-invalid={!!fields.reason} aria-describedby={fields.reason ? 'change-reason-error' : undefined} />{fields.reason && <p id="change-reason-error" className="field-error">{fields.reason[0]}</p>}</div>}
      {failure && <AdminNotice error>{failure}</AdminNotice>}
      <div className="admin-dialog-actions"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button className="primary" type="submit" disabled={pending || (mode === 'status' && status !== 'active' && !reason.trim())}>{pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : mode === 'role' ? 'Confirm role' : status === 'active' ? 'Restore account' : 'Confirm status'}</Button></div>
    </form>
  </Dialog>
}
export default function AdminUserDetailsPage() {
  const { id } = useParams()
  const location = useLocation()
  const targetId = id && /^[1-9][0-9]*$/.test(id) && Number(id) <= 2147483647 ? Number(id) : 0
  const auth = useAuth()
  const access = useOutletContext<Access>()
  const client = useQueryClient()
  const query = useAdminUser(auth.data?.id ?? 0, targetId)
  const identity = useAdminIdentityMethods(auth.data?.id ?? 0, targetId,
    access.role === 'admin' && access.account_status === 'active' && !!query.data && query.data.id !== auth.data?.id
      && query.data.role !== 'admin' && !query.data.invitation_pending)
  const firebaseMode = import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase'
  const history = useModerationActions(auth.data?.id ?? 0, 1, { target_type: 'user', target_id: String(targetId) })
  const mutation = useAdminUserChange(auth.data?.id ?? 0)
  const resend = useResendAdminInvitation(auth.data?.id ?? 0)
  const passwordChange = useChangeAdminPassword(auth.data?.id ?? 0)
  const passwordReset = useSendAdminPasswordReset(auth.data?.id ?? 0)
  const initialAction: unknown = location.state?.action
  const [mode, setMode] = useState<Mode | null>(initialAction === 'edit' || initialAction === 'role' || initialAction === 'status' ? initialAction : null)
  const [passwordMode, setPasswordMode] = useState<'change' | 'reset' | null>(initialAction === 'password' ? 'change' : null)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  if (access.role !== 'admin') return <AdminNotice error>Only administrators can manage users.</AdminNotice>
  if (!targetId) return <AdminNotice error>Invalid account ID.</AdminNotice>
  const user = query.data
  const isSelf = user?.id === auth.data?.id
  const canManagePassword = access.account_status === 'active' && user && !isSelf && user.role !== 'admin' && !user.invitation_pending
  const hasPassword = !firebaseMode || identity.data?.includes('password')
  const done = (message: string) => {
    if (client.getQueryData<User | null>(authKey)?.id !== auth.data?.id) return
    setMode(null); setPasswordMode(null); setNoticeError(false); setNotice(message)
  }
  return <AdminShell>
    <Link className="admin-back" to="/admin/users">← Back to users</Link>
    {query.isPending ? <AdminNotice>Loading account…</AdminNotice>
      : query.isError ? <div><AdminNotice error>{adminError(query.error).message}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></div>
        : user && <><div className="admin-heading"><div><p className="eyebrow">Account #{user.id}</p><h1>{user.username}</h1><p className="text-muted">Manage account information and access.</p></div><AccountBadge value={user.account_status} /></div>
          {notice && <AdminNotice error={noticeError}>{notice}</AdminNotice>}
          <div className="admin-detail-grid">
            <section className="admin-panel"><h2>Account details</h2><dl><dt>Username</dt><dd>{user.username}</dd><dt>Email</dt><dd className="admin-email">{user.email}</dd><dt>Email verification</dt><dd>{user.email_verified_at ? 'Verified' : user.invitation_pending ? 'Invitation pending' : 'Pending'}</dd><dt>Joined</dt><dd>{new Date(user.created_at).toLocaleString()}</dd><dt>Updated</dt><dd>{new Date(user.updated_at).toLocaleString()}</dd></dl><div className="admin-access-actions"><Button onClick={() => { setNotice(''); setMode('edit') }}>Edit account</Button>{user.invitation_pending && !user.email_verified_at && <Button disabled={resend.isPending || access.account_status !== 'active' || user.account_status !== 'active'} onClick={async () => {
              setNotice(''); setNoticeError(false)
              try { const delivery = await resend.mutateAsync(user.id); if (client.getQueryData<User | null>(authKey)?.id === auth.data?.id) setNotice(delivery === 'accepted' ? 'The mail service accepted the new invitation. The previous link is no longer valid.' : 'A new link was created, but email delivery failed. You can try resending again.') }
              catch (error) { if (client.getQueryData<User | null>(authKey)?.id === auth.data?.id) { setNoticeError(true); setNotice(adminError(error).message) } }
            }}>{resend.isPending ? 'Sending…' : 'Resend invitation'}</Button>}</div></section>
            <section className="admin-panel"><h2>Access</h2><div className="admin-access-row"><span>Role</span><AccountBadge value={user.role} /></div><div className="admin-access-row"><span>Status</span><AccountBadge value={user.account_status} /></div><p className="admin-hint">Changes take effect on the server. Active sessions for the affected account are revoked.</p><div className="admin-access-actions"><Button disabled={user.role === 'admin' || isSelf || access.account_status !== 'active'} onClick={() => { setNotice(''); setMode('role') }}>Change role</Button><Button disabled={isSelf || access.account_status !== 'active'} onClick={() => { setNotice(''); setMode('status') }}>{user.account_status === 'active' ? 'Change status' : 'Restore account'}</Button></div>{user.role === 'admin' && <p className="admin-hint">Administrator roles are managed through trusted server provisioning.</p>}</section>
            {canManagePassword && <section className="admin-panel"><h2>Password management</h2><p className="admin-hint">Help this person regain access. A password change signs out their existing sessions; a reset link lets them choose a new password.</p>{firebaseMode && identity.isError && <AdminNotice error>{adminError(identity.error).message}</AdminNotice>}{firebaseMode && !identity.isPending && !identity.isError && !hasPassword && <p className="admin-hint">This account uses Google or GitHub without an email/password method. A password must be added explicitly by the account owner.</p>}<div className="admin-access-actions"><Button disabled={firebaseMode && !hasPassword} onClick={() => { setNotice(''); setPasswordMode('change') }}>Change password</Button><Button disabled={firebaseMode && !hasPassword} onClick={() => { setNotice(''); setPasswordMode('reset') }}>Send password reset</Button></div></section>}
          </div>
          <div className="admin-section-heading"><h2>Recent administrative activity</h2><Link to={`/admin/actions?target_type=user&target_id=${user.id}`}>View history</Link></div>
          {history.isPending ? <AdminNotice>Loading account history…</AdminNotice> : history.isError ? <AdminNotice error>{adminError(history.error).message}</AdminNotice> : !history.data?.data.length ? <AdminNotice>No administrative changes recorded for this account.</AdminNotice>
            : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Action</th><th>Administrator</th><th>Reason</th></tr></thead><tbody>{history.data.data.slice(0, 5).map(item => <tr key={item.id}><td data-label="Date">{new Date(item.created_at).toLocaleString()}</td><td data-label="Action">{item.action.replace(/[._]/g, ' ')}</td><td data-label="Administrator">{item.actor ? `@${item.actor.username}` : 'Deleted account'}</td><td data-label="Reason">{item.reason || '—'}</td></tr>)}</tbody></table></div>}
          {mode && <ChangeDialog key={`${mode}-${user.id}`} mode={mode} user={user} adminEmail={auth.data?.email} onClose={() => setMode(null)} onDone={done} change={operation => mutation.mutateAsync(operation)} pending={mutation.isPending} />}
          {passwordMode && canManagePassword && <PasswordManagementDialog key={`${passwordMode}-${user.id}`} mode={passwordMode} user={user} adminEmail={auth.data?.email} onClose={() => setPasswordMode(null)} onDone={done} onChange={values => passwordChange.mutateAsync({ id: user.id, values })} onReset={reason => passwordReset.mutateAsync({ id: user.id, reason })} pending={passwordChange.isPending || passwordReset.isPending} />}
        </>}
  </AdminShell>
}
