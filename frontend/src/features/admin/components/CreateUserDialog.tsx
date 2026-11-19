import { useRef, useState, type FormEvent } from 'react'
import axios from 'axios'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Input } from '../../../components/ui/Input'
import { adminError, type CreatedAdminUser } from '../api/adminUsersApi'
import { AdminNotice } from './AdminShell'

export function CreateUserDialog({ onClose, onCreate, pending, onDone }: {
  onClose: () => void; onCreate: (values: { username: string; email: string; role?: 'user' | 'moderator' }) => Promise<CreatedAdminUser>
  pending: boolean; onDone: (result: CreatedAdminUser) => void
}) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'moderator'>('user')
  const firebaseMode = import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase'
  const [failure, setFailure] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const submitting = useRef(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending || submitting.current) return
    submitting.current = true
    setFailure(''); setFields({})
    try {
      const result = await onCreate({ username: username.trim().toLowerCase(), email: email.trim().toLowerCase(),
        ...(firebaseMode ? { role } : {}) })
      onDone(result)
    } catch (error) {
      const details = adminError(error)
      setFailure(axios.isAxiosError(error) && error.response?.status === 503
        ? 'Firebase provisioning may have started. Search this email in User Management and use Resend invitation if a pending account appears.'
        : details.message)
      setFields(details.fields)
    } finally { submitting.current = false }
  }
  return <Dialog title="Create account" onClose={onClose} busy={pending}>
    <p className="text-muted">Create a VYBE account. The person will set their own password using an invitation link.</p>
    <form onSubmit={event => void submit(event)}>
      <Input label="Username" name="username" value={username} onChange={event => setUsername(event.target.value)} error={fields.username?.[0]} minLength={3} maxLength={30} required disabled={pending} />
      <Input label="Email" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} error={fields.email?.[0]} maxLength={255} required disabled={pending} />
      {firebaseMode && <div className="field"><label htmlFor="create-role">Role</label><select id="create-role" value={role} onChange={event => setRole(event.target.value as 'user' | 'moderator')} disabled={pending}><option value="user">User</option><option value="moderator">Moderator</option></select></div>}
      {failure && <AdminNotice error>{failure}</AdminNotice>}
      <div className="admin-dialog-actions"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button className="primary" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create and invite'}</Button></div>
    </form>
  </Dialog>
}
