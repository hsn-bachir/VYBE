import { useState } from 'react'
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../../../components/ui/Button'
import { useAccess } from '../hooks/useAccess'
import { useLogout } from '../hooks/useAuth'
import axios from 'axios'
import { accessDestination, canEnterAdmin } from './access'

export function AuthStatus({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const logout = useLogout()
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try { await auth.refetch() } finally { setRetrying(false) }
  }
  if (auth.isPending && !retrying) return <div className="status" role="status">Checking your session…</div>
  if (auth.isError && axios.isAxiosError(auth.error) && auth.error.response?.status === 403) {
    const code = auth.error.response.data?.code
    return <div className="status" role="alert"><h1>Account unavailable</h1><p>{code === 'ACCOUNT_BANNED' ? 'This account is banned.' : code === 'ACCOUNT_DEACTIVATED' ? 'This account is deactivated.' : 'This account cannot access VYBE.'}</p><Button disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button></div>
  }
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

export function RequireAdmin() {
  const auth = useAuth()
  const access = useAccess(auth.data?.id, !!auth.data?.email_verified_at)
  if (access.isPending || access.isFetching) return <div className="status" role="status">Checking admin access…</div>
  if (access.isError) return <div className="status" role="alert">Admin access could not be checked. <Button onClick={() => void access.refetch()}>Try again</Button></div>
  if (!canEnterAdmin(access.data)) {
    return <div className="status" role="alert"><h1>Access denied</h1><p>This area is for moderators and administrators.</p></div>
  }
  return <Outlet context={access.data} />
}

export function RequireUserManager() {
  const access = useOutletContext<import('../hooks/useAccess').Access>()
  if (access.role !== 'admin') return <div className="status" role="alert"><h1>Access denied</h1><p>User management is for administrators.</p></div>
  return <Outlet context={access} />
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
