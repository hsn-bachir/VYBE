import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { completePasswordReset } from '../api/authApi'
import { FirebasePasswordResetPage } from './FirebasePasswordResetPage'

function resetLinkFromFragment() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  return { email: params.get('email') ?? '', token: params.get('token') ?? '' }
}

export function PasswordResetPage() {
  if (import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase') return <FirebasePasswordResetPage />
  return <LegacyPasswordResetPage />
}

function LegacyPasswordResetPage() {
  const [link, setLink] = useState(resetLinkFromFragment)
  const [email, setEmail] = useState(link.email)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [success, setSuccess] = useState(false)
  const [failure, setFailure] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending || submitting.current || !link.token) return
    submitting.current = true
    setPending(true); setFailure(''); setFields({})
    try {
      await completePasswordReset({ email, token: link.token, password, password_confirmation: confirmation })
      setSuccess(true); setLink({ email: '', token: '' }); setPassword(''); setConfirmation('')
    } catch (error) {
      const detail = errorDetails(error)
      setFailure(detail.fields.token?.[0] ?? detail.message)
      setFields(detail.fields)
    } finally { submitting.current = false; setPending(false) }
  }
  return <div className="auth-card">
    <p className="eyebrow">Account recovery</p>
    <h2>{success ? 'Password updated' : 'Choose a new password'}</h2>
    {success ? <><p className="text-muted" role="status">Your password has changed. Existing sessions were signed out. Sign in with your new password.</p><Link className="button primary" to="/login">Sign in</Link></>
      : !link.token ? <><p role="alert">This reset link is incomplete. Ask an administrator to send a new link.</p><Link to="/login">Back to sign in</Link></>
        : <><p className="text-muted">Reset links work once and expire after one hour.</p>
          <form onSubmit={event => void submit(event)} aria-label="Reset password" autoComplete="off">
            {failure && <div className="form-error" role="alert">{failure}</div>}
            <Input label="Email address" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} error={fields.email?.[0]} autoComplete="email" required disabled={pending} />
            <Input label="New password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} error={fields.password?.[0]} autoComplete="new-password" minLength={12} maxLength={255} hint="At least 12 characters, including a letter and a number." required disabled={pending} />
            <Input label="Confirm new password" name="password_confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} error={fields.password_confirmation?.[0]} autoComplete="new-password" required disabled={pending} />
            <Button className="primary w-full" type="submit" disabled={pending}>{pending ? 'Updating…' : 'Update password'}</Button>
          </form></>}
  </div>
}
