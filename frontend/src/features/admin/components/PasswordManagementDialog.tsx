import { useRef, useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Input } from '../../../components/ui/Input'
import { adminError, type AdminUser, type PasswordChange, type ResetDelivery } from '../api/adminUsersApi'
import { AdminNotice } from './AdminShell'

export function PasswordManagementDialog({ mode, user, pending, onClose, onChange, onReset, onDone }: {
  mode: 'change' | 'reset'; user: AdminUser; pending: boolean; onClose: () => void
  onChange: (values: PasswordChange) => Promise<void>
  onReset: (reason: string) => Promise<ResetDelivery>
  onDone: (message: string) => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const submitting = useRef(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending || submitting.current) return
    submitting.current = true
    setFailure(''); setFields({})
    try {
      if (mode === 'change') {
        await onChange({ admin_current_password: adminPassword, password, password_confirmation: confirmation, reason })
        setPassword(''); setConfirmation(''); setAdminPassword('')
        onDone('Password changed. Existing sessions for this account were revoked.')
      } else {
        const delivery = await onReset(reason)
        onDone(delivery === 'accepted' ? 'The mail service accepted the reset link. Inbox delivery is not guaranteed.'
          : 'A reset link was created, but email delivery was not confirmed. You can try again after the cooldown.')
      }
    } catch (error) {
      const details = adminError(error)
      setFailure(details.message); setFields(details.fields)
    } finally { submitting.current = false }
  }
  return <Dialog title={mode === 'change' ? 'Change account password' : 'Send password reset'} onClose={onClose} busy={pending}>
    <p className="text-muted">{user.username} · Account #{user.id}</p>
    <p className="admin-hint">{mode === 'change'
      ? 'This signs out the account’s existing sessions. The account’s role and status stay the same.'
      : 'Send a one-use link so this person can choose a new password. Their account status will not change.'}</p>
    <form onSubmit={event => void submit(event)} autoComplete="off">
      {mode === 'change' && <>
        <Input label="New password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} error={fields.password?.[0]} autoComplete="new-password" minLength={12} maxLength={255} hint="At least 12 characters, including a letter and a number." required disabled={pending} />
        <Input label="Confirm new password" name="password_confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} error={fields.password_confirmation?.[0]} autoComplete="new-password" required disabled={pending} />
        <Input label="Your administrator password" name="admin_current_password" type="password" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} error={fields.admin_current_password?.[0]} autoComplete="current-password" required disabled={pending} />
      </>}
      <div className="field"><label htmlFor="password-reason">Reason</label><textarea id="password-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required disabled={pending} aria-invalid={!!fields.reason} aria-describedby={fields.reason ? 'password-reason-error' : undefined} />{fields.reason && <p id="password-reason-error" className="field-error">{fields.reason[0]}</p>}</div>
      {failure && <AdminNotice error>{failure}</AdminNotice>}
      <div className="admin-dialog-actions"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button className="primary" type="submit" disabled={pending || !reason.trim()}>{pending ? 'Processing…' : mode === 'change' ? 'Change password' : 'Send reset link'}</Button></div>
    </form>
  </Dialog>
}
