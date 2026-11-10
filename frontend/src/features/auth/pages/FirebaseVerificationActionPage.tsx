import { useEffect, useRef, useState } from 'react'
import { applyActionCode, checkActionCode } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { verificationStatus } from '../api/authApi'
import { firebaseAuth } from '../api/firebaseClient'
import { authKey, useLogout } from '../hooks/useAuth'

export function FirebaseVerificationActionPage() {
  const code = new URLSearchParams(window.location.search).get('oobCode') ?? ''
  const recovery = new URLSearchParams(window.location.search).get('mode') === 'recoverEmail'
  const started = useRef(false)
  const [state, setState] = useState<'checking' | 'verified' | 'applied' | 'expired' | 'invalid'>(code ? 'checking' : 'invalid')
  const [hasSession, setHasSession] = useState(false)
  const [differentAccount, setDifferentAccount] = useState(false)
  const query = useQueryClient()
  const signOut = useLogout()

  useEffect(() => {
    if (!code || started.current) return
    started.current = true
    Promise.resolve()
      .then(() => firebaseAuth())
      .then(async firebase => {
        const action = await checkActionCode(firebase, code)
        await applyActionCode(firebase, code)
        return action.data.email?.trim().toLowerCase() ?? null
      })
      .then(async actionEmail => {
        try {
          const user = await verificationStatus()
          query.setQueryData(authKey, user)
          if (actionEmail && user.email.trim().toLowerCase() !== actionEmail) {
            setDifferentAccount(true)
            setState('applied')
          } else if (actionEmail && user.email_verified_at) {
            setHasSession(true)
            setState('verified')
          } else {
            setHasSession(true)
            setState('applied')
          }
        } catch { /* Another browser may have no Laravel session. */ }
        setState(previous => previous === 'verified' ? previous : 'applied')
        window.history.replaceState(window.history.state, '', window.location.pathname)
      })
      .catch(error => setState(error?.code === 'auth/expired-action-code' ? 'expired' : 'invalid'))
  }, [code, query])

  return <div className="auth-card verification-card">
    <p className="eyebrow">Account security</p>
    {state === 'checking' ? <p role="status">Checking email link…</p>
      : state === 'verified' || state === 'applied' ? <><h2>{recovery ? 'Email action completed' : state === 'verified' ? 'Email verified successfully' : 'Email link accepted'}</h2><p className="text-muted">{differentAccount ? 'This browser is signed in to another VYBE account. Sign out, then sign in to the account that received the link.' : state === 'verified' ? 'Your account is ready.' : hasSession ? 'Check your account status before continuing.' : 'Sign in to check your account status.'}</p>{differentAccount ? <><Button className="primary continue-button" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => setDifferentAccount(false) })}>{signOut.isPending ? 'Signing out…' : 'Sign out'}</Button>{signOut.isError && <p role="alert">Could not sign out. Try again.</p>}</> : <Link className="button primary continue-button" to={state === 'verified' ? '/' : hasSession ? '/verify-email' : '/login'}>{state === 'verified' ? 'Continue to VYBE' : hasSession ? 'Check status' : 'Sign in'}</Link>}</>
        : <><h2>{state === 'expired' ? 'Link expired' : 'Link not valid'}</h2><p className="text-muted">Sign in and request another verification email.</p><Link to="/verify-email">Back to verification</Link></>}
  </div>
}
