import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { requestFirebasePasswordReset } from '../api/authApi'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true); setFailure('')
    try {
      await requestFirebasePasswordReset(email.trim())
      setSent(true)
    } catch (error) {
      setFailure(errorDetails(error).message)
    } finally {
      setPending(false)
    }
  }

  return <div className="auth-card">
    <p className="eyebrow">Account recovery</p>
    <h2>Reset your password</h2>
    {sent ? <><p role="status" className="text-muted">If a Firebase account exists for that address, a reset link is on its way. Check your inbox and spam folder.</p><Link className="button primary" to="/login">Back to sign in</Link></>
      : <><p className="text-muted">Enter your email address to receive a password reset link.</p>
        <form onSubmit={submit} aria-label="Request password reset">
          {failure && <div role="alert" className="form-error">{failure}</div>}
          <Input label="Email address" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={255} disabled={pending} />
          <Button type="submit" className="primary w-full" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</Button>
        </form><p className="auth-switch"><Link to="/login">Back to sign in</Link></p></>}
  </div>
}
