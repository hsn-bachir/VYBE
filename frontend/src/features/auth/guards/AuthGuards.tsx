import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../../../components/ui/Button'
import { accessDestination } from './access'

export function AuthStatus({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  if (auth.isPending) return <div className="status" role="status">Checking your session…</div>
  if (auth.isError) return <div className="status" role="alert"><p>We couldn’t check your session.</p><Button onClick={() => void auth.refetch()}>Try again</Button></div>
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
