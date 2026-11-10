import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { firebaseAuth } from '../api/firebaseClient'
import { completeSocialRegistration } from '../api/firebaseSocial'
import { storeAuthenticatedUser } from '../hooks/useAuth'

export function SocialUsernamePage() {
  const [hasIdentity] = useState(() => { try { return Boolean(firebaseAuth().currentUser) } catch { return false } })
  const [username, setUsername] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const [field, setField] = useState('')
  const navigate = useNavigate()
  const query = useQueryClient()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const normalized = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,30}$/.test(normalized) || ['admin', 'support', 'system', 'root', 'vybe'].includes(normalized)) {
      setField('Use 3–30 letters, numbers, or underscores; this username may be reserved.')
      return
    }
    setPending(true); setFailure(''); setField('')
    try {
      const user = await completeSocialRegistration(normalized)
      await storeAuthenticatedUser(query, user)
      navigate(user.email_verified_at ? '/' : '/verify-email', { replace: true })
    } catch (error) {
      const details = errorDetails(error)
      setField(details.fields.username?.[0] ?? '')
      setFailure(details.message)
    } finally {
      setPending(false)
    }
  }

  return <div className="auth-card">
    <p className="eyebrow">Your next chapter</p>
    <h2>Choose your VYBE username</h2>
    {!hasIdentity ? <><p role="alert">Your social sign-in expired. Start again to choose a username.</p><Link className="button primary" to="/login">Back to sign in</Link></>
      : <><p className="text-muted">Your social identity is ready. Choose the name people will see on VYBE.</p>
        <form onSubmit={submit} aria-label="Choose username">
          {failure && <div role="alert" className="form-error">{failure}</div>}
          <Input name="username" label="Username" autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" hint="3–30 letters, numbers, or underscores." value={username} onChange={event => setUsername(event.target.value)} error={field} disabled={pending} />
          <Button type="submit" className="primary w-full" disabled={pending}>{pending ? 'Creating account…' : 'Continue to VYBE'}</Button>
        </form><p className="auth-switch"><Link to="/login">Start over</Link></p></>}
  </div>
}
