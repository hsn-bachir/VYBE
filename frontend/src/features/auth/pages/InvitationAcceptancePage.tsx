import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { acceptInvitation } from '../api/authApi'
import { freshFirebaseIdentityToken } from '../api/firebaseSocial'

function invitationFromFragment() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  return { email: params.get('email') ?? '', token: params.get('token') ?? '', existing: params.get('existing') === '1' }
}

export function InvitationAcceptancePage() {
  const firebaseMode = import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase'
  const [invitation, setInvitation] = useState(invitationFromFragment)
  const [email, setEmail] = useState(invitation.email)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [method, setMethod] = useState<'password' | 'google.com' | 'github.com'>('password')
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [success, setSuccess] = useState(false)
  const [connectedExisting, setConnectedExisting] = useState(false)
  const [failure, setFailure] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  useEffect(() => {
    // Fragments do not reach the web server or referrers. Remove it from browser history too.
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending || submitting.current || !invitation.token) return
    submitting.current = true
    setFailure(''); setFields({}); setPending(true)
    try {
      if (firebaseMode && invitation.existing) {
        const idToken = await freshFirebaseIdentityToken(method, email, password)
        await acceptInvitation({ email, token: invitation.token, id_token: idToken })
      } else {
        await acceptInvitation({ email, token: invitation.token, password, password_confirmation: confirmation })
      }
      setConnectedExisting(firebaseMode && invitation.existing)
      setSuccess(true); setInvitation({ email: '', token: '', existing: false }); setPassword(''); setConfirmation('')
    } catch (error) {
      const detail = errorDetails(error)
      setFailure(detail.fields.invitation?.[0] ?? detail.message)
      setFields(detail.fields)
    } finally { submitting.current = false; setPending(false) }
  }
  return <div className="auth-card">
    <p className="eyebrow">Your invitation</p>
    <h2>{success ? 'Welcome to VYBE' : 'Activate your account'}</h2>
    {success ? <><p className="text-muted" role="status">{connectedExisting ? 'Your existing Firebase sign-in is connected to VYBE.' : 'Your password is set and your email is verified.'} You can now sign in.</p><Link className="button primary" to="/login">Sign in</Link></>
      : !invitation.token ? <><p role="alert">This invitation link is incomplete. Ask an administrator to resend it.</p><Link to="/login">Back to sign in</Link></>
        : <><p className="text-muted">{firebaseMode && invitation.existing ? 'Sign in to your existing Firebase account to connect it to VYBE.' : `Set a ${firebaseMode ? 'Firebase' : 'VYBE'} password to finish joining VYBE.`} Invitation links expire after a short time and work once.</p>
          <form onSubmit={event => void submit(event)} aria-label="Accept invitation">
            {failure && <div className="form-error" role="alert">{failure}</div>}
            <Input label="Email address" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} error={fields.email?.[0]} autoComplete="email" required disabled={pending} />
            {firebaseMode && invitation.existing && <div className="field"><label htmlFor="invitation-method">Existing sign-in method</label><select id="invitation-method" value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="password">Email and password</option><option value="google.com">Google</option><option value="github.com">GitHub</option></select></div>}
            {(!firebaseMode || !invitation.existing || method === 'password') && <Input label={firebaseMode && invitation.existing ? 'Current Firebase password' : 'Password'} name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} error={fields.password?.[0]} autoComplete={firebaseMode && invitation.existing ? 'current-password' : 'new-password'} minLength={firebaseMode && invitation.existing ? undefined : 12} maxLength={255} hint={firebaseMode && invitation.existing ? undefined : 'At least 12 characters, including a letter and a number.'} required disabled={pending} />}
            {(!firebaseMode || !invitation.existing) && <Input label="Confirm password" name="password_confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} error={fields.password_confirmation?.[0]} autoComplete="new-password" required disabled={pending} />}
            <Button className="primary w-full" type="submit" disabled={pending}>{pending ? 'Activating…' : firebaseMode && invitation.existing ? 'Connect existing sign-in' : 'Activate account'}</Button>
          </form></>}
  </div>
}
