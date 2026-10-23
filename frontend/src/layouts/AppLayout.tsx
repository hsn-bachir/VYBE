import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, useLogout } from '../features/auth/hooks/useAuth'
import { errorDetails } from '../lib/api/client'
import { Button } from '../components/ui/Button'
import { VybeLogo } from '../components/branding/VybeLogo'

export function AppLayout() {
  const auth = useAuth()
  const logout = useLogout()
  const navigate = useNavigate()
  return <div className="app-layout">
    <header><VybeLogo variant="symbol" /><nav aria-label="Main navigation">
      {auth.isPending ? <span role="status">Checking session…</span> : auth.data ? <><span className="account-name">@{auth.data.username}</span><Button disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })}>{logout.isPending ? 'Signing out…' : 'Sign out'}</Button></> : <><Link to="/login">Sign in</Link><Link className="button" to="/register">Join VYBE</Link></>}
    </nav></header>
    {logout.error && <p role="alert" className="form-error">{errorDetails(logout.error).message}</p>}
    {auth.isError && <p role="alert">Session unavailable. <button onClick={() => void auth.refetch()}>Retry</button></p>}
    <main className="public-content"><Outlet /></main><footer>VYBE · For the love of cinema.</footer>
  </div>
}
