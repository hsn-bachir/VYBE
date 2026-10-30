import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../../../components/ui/Button'
import { accessDestination } from './access'

export function AuthStatus({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try { await auth.refetch() } finally { setRetrying(false) }
  }
  if (auth.isPending && !retrying) return <div className="status" role="status">Checking your session…</div>
  if (auth.isError || retrying) return <div className="status" aria-busy={retrying || auth.isFetching}>
    <div role="alert"><p>We couldn’t check your session.</p><p className="text-muted">VYBE couldn’t reach the account service. Check your connection and try again.</p></div>
    <Button disabled={retrying || auth.isFetching} onClick={() => void retry()}>Try again</Button>
    <p role="status">{retrying || auth.isFetching ? 'Checking your session again…' : 'We’ll keep you on this page while you reconnect.'}</p>
  </div>
  return children
}

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()
  const destination = accessDestination(auth.data ?? null, true)
  return <AuthStatus>{destination ? <Navigate to={destination} state={destination === '/login' ? { from: location.pathname + location.search } : undefined} replace /> : <Outlet />}</AuthStatus>
}

export function GuestOnly() {
  const auth = useAuth()
  return <AuthStatus>{auth.data ? <Navigate to={auth.data.email_verified_at ? '/' : '/verify-email'} replace /> : <Outlet />}</AuthStatus>
}

export function PublicOrVerified() {
  const auth = useAuth()
  const destination = accessDestination(auth.data ?? null, false)
  return <AuthStatus>{destination ? <Navigate to={destination} replace /> : <Outlet />}</AuthStatus>
}
