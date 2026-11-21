import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { cancelSocialLink, linkSocialProvider, reauthenticateForLink, type SocialProvider } from '../api/firebaseSocial'
import { verificationStatus } from '../api/authApi'
import { authKey, useAuth } from '../hooks/useAuth'
import { ProviderIcon } from '../components/ProviderIcon'
import { Alert } from '../../../components/ui/Alert'
import { useQueryClient } from '@tanstack/react-query'

export function ProviderConnectionsPage() {
  const auth = useAuth()
  const query = useQueryClient()
  const [password, setPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const [feedback, setFeedback] = useState('')

  async function confirm(method: 'password' | SocialProvider) {
    if (pending || !auth.data) return
    setPending(true); setFailure(''); setFeedback('')
    try {
      await reauthenticateForLink(method, auth.data.email, password)
      setPassword(''); setReady(true)
      setFeedback('Identity confirmed. Choose a provider to connect.')
    } catch (error) { setFailure(errorDetails(error).message) }
    finally { setPending(false) }
  }

  async function connect(provider: SocialProvider) {
    if (pending || !ready) return
    setPending(true); setFailure(''); setFeedback('')
    try {
      await linkSocialProvider(provider)
      setReady(false)
      try {
        query.setQueryData(authKey, await verificationStatus())
        setFeedback(`${provider === 'google.com' ? 'Google' : 'GitHub'} connected to your existing VYBE account.`)
      } catch {
        setFailure('Provider connected in Firebase, but VYBE could not refresh your account status. Sign out and sign in again before continuing.')
      }
    } catch (error) { setFailure(errorDetails(error).message) }
    finally { setPending(false) }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void confirm('password')
  }

  return <div className="auth-card">
    <p className="eyebrow">Account security</p>
    <h1>Connect sign-in methods</h1>
    <p className="text-muted">Confirm an existing Firebase sign-in method for this VYBE account, then connect Google or GitHub. Your VYBE profile and activity stay with the same account.</p>
    {failure && <Alert variant="error">{failure}</Alert>}
    {feedback && <Alert variant="success">{feedback}</Alert>}
    {!ready ? <>
      <form onSubmit={submitPassword} aria-label="Confirm email password">
        <Input label="Current Firebase password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={pending} />
        <Button type="submit" disabled={pending || !auth.data}>Confirm with password</Button>
      </form>
      <p className="text-muted">Or confirm with a provider already connected to this Firebase account:</p>
      <div className="oauth-options"><Button type="button" disabled={pending || !auth.data} onClick={() => void confirm('google.com')}><span className="provider-label"><ProviderIcon provider="google.com" />Confirm with Google</span></Button><Button type="button" disabled={pending || !auth.data} onClick={() => void confirm('github.com')}><span className="provider-label"><ProviderIcon provider="github.com" />Confirm with GitHub</span></Button></div>
    </> : <>
      <div className="oauth-options"><Button type="button" disabled={pending} onClick={() => void connect('google.com')}><span className="provider-label"><ProviderIcon provider="google.com" />Connect Google</span></Button><Button type="button" disabled={pending} onClick={() => void connect('github.com')}><span className="provider-label"><ProviderIcon provider="github.com" />Connect GitHub</span></Button></div>
      <Button type="button" disabled={pending} onClick={() => { void cancelSocialLink(); setReady(false); setFeedback('Connection cancelled.') }}>Cancel</Button>
    </>}
    <p className="auth-switch"><Link to="/profile">Back to profile</Link></p>
  </div>
}
