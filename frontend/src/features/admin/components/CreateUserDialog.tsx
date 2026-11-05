import { useRef, useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Input } from '../../../components/ui/Input'
import { adminError, type CreatedAdminUser } from '../api/adminUsersApi'
import { AdminNotice } from './AdminShell'

export function CreateUserDialog({ onClose, onCreate, pending, onDone }: {
  onClose: () => void; onCreate: (values: { username: string; email: string }) => Promise<CreatedAdminUser>
  pending: boolean; onDone: (result: CreatedAdminUser) => void
}) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [failure, setFailure] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const submitting = useRef(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending || submitting.current) return
    submitting.current = true
    setFailure(''); setFields({})
    try {
      const result = await onCreate({ username: username.trim().toLowerCase(), email: email.trim().toLowerCase() })
      onDone(result)
    } catch (error) {
      const details = adminError(error)
      setFailure(details.message); setFields(details.fields)
    } finally { submitting.current = false }
  }
  return <Dialog title="Create account" onClose={onClose} busy={pending}>
    <p className="text-muted">Create a standard VYBE account. The person will set their own password using an invitation link.</p>
    <form onSubmit={event => void submit(event)}>
      <Input label="Username" name="username" value={username} onChange={event => setUsername(event.target.value)} error={fields.username?.[0]} minLength={3} maxLength={30} required disabled={pending} />
      <Input label="Email" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} error={fields.email?.[0]} maxLength={255} required disabled={pending} />
      {failure && <AdminNotice error>{failure}</AdminNotice>}
      <div className="admin-dialog-actions"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button className="primary" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create and invite'}</Button></div>
    </form>
  </Dialog>
}
