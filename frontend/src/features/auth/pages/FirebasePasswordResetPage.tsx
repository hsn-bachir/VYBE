import { useEffect, useState, type FormEvent } from 'react'
import { verifyPasswordResetCode } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { completeFirebasePasswordReset } from '../api/authApi'
import { firebaseAuth } from '../api/firebaseClient'

export function FirebasePasswordResetPage() {
  const code = new URLSearchParams(window.location.search).get('oobCode') ?? ''
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(Boolean(code))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [failure, setFailure] = useState(code ? '' : 'This reset link is incomplete.')
  const [fields, setFields] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!code) return
    let active = true
    Promise.resolve().then(() => verifyPasswordResetCode(firebaseAuth(), code))
      .then(value => { if (active) { setEmail(value); setChecking(false) } })
      .catch(() => { if (active) { setFailure('This reset link is invalid or expired.'); setChecking(false) } })
    return () => { active = false }
  }, [code])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || checking || !email || password !== confirmation) {
      if (password !== confirmation) setFields({ password_confirmation: ['Passwords must match.'] })
      return
    }
    setPending(true); setFailure(''); setFields({})
    try {
      await completeFirebasePasswordReset({ oob_code: code, password, password_confirmation: confirmation })
      setSuccess(true); setPassword(''); setConfirmation('')
      window.history.replaceState(window.history.state, '', window.location.pathname)
    } catch (error) {
      const detail = errorDetails(error)
      setFailure(detail.fields.oob_code?.[0] ?? detail.message)
      setFields(detail.fields)
    } finally {
      setPending(false)
    }
  }

  return <div className="auth-card">
    <p className="eyebrow">Account recovery</p>
    <h2>{success ? 'Password updated' : 'Choose a new password'}</h2>
    {success ? <><p role="status" className="text-muted">Your password has changed. Existing VYBE sessions were signed out.</p><Link className="button primary" to="/login">Sign in</Link></>
      : checking ? <p role="status">Checking reset link…</p>
        : !email ? <><p role="alert">{failure}</p><Link to="/password/forgot">Request another link</Link></>
          : <><p className="text-muted">Resetting the password for {email}.</p>
            <form onSubmit={submit} aria-label="Reset password" autoComplete="off">
              {failure && <div role="alert" className="form-error">{failure}</div>}
              <Input label="New password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} error={fields.password?.[0]} autoComplete="new-password" minLength={12} maxLength={255} required disabled={pending} />
              <Input label="Confirm new password" name="password_confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} error={fields.password_confirmation?.[0]} autoComplete="new-password" required disabled={pending} />
              <Button type="submit" className="primary w-full" disabled={pending}>{pending ? 'Updating…' : 'Update password'}</Button>
            </form></>}
  </div>
}
