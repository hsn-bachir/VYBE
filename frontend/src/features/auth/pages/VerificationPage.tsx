import { SectionSkeleton } from '../../../components/ui/SectionSkeleton'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { errorDetails } from '../../../lib/api/client'
import { resendVerification, verificationStatus } from '../api/authApi'
import { authKey, useAuth, useLogout } from '../hooks/useAuth'

export function VerificationPage({ state }: { state: 'pending' | 'success' | 'error' }) {
  const auth = useAuth(state === 'success' ? 0 : 5_000)
  const query = useQueryClient()
  const firebaseMode = import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase'
  const verification = useQuery({
    queryKey: ['auth', 'verification-status', auth.data?.id],
    queryFn: verificationStatus,
    enabled: firebaseMode && Boolean(auth.data),
    retry: false,
  })
  const current = verification.data ?? auth.data
  useEffect(() => {
    if (verification.data) query.setQueryData(authKey, verification.data)
  }, [verification.data, query])
  const navigate = useNavigate()
  const signOut = useLogout()
  const [params] = useSearchParams()
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [clock, setClock] = useState(0)
  const resend = useMutation({ mutationFn: resendVerification, onSuccess: () => {
    if (firebaseMode) void verification.refetch()
    setCooldownUntil(Date.now() + 60_000)
    setClock(Date.now())
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    window.setTimeout(() => window.clearInterval(timer), 60_000)
  } })

  if (auth.isPending) return <SectionSkeleton label="Checking verification status" />
  if (state === 'success' && auth.isFetching) return <SectionSkeleton label="Checking verification status" />
  if (auth.isError) return <div role="alert">Could not check your account. <Button onClick={() => void auth.refetch()}>Retry</Button></div>
  if (state === 'pending' && !auth.data) return <Navigate to="/login" replace />
  if (firebaseMode && auth.data && verification.isPending) return <SectionSkeleton label="Checking verification status" />
  if (firebaseMode && verification.isError) return <div role="alert">Could not check your verification status. <Button onClick={() => void verification.refetch()}>Retry</Button></div>
  const verified = Boolean(current?.email_verified_at)
  const reason = params.get('reason')
  const wait = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000))

  return <div className="auth-card verification-card">
    <p className="eyebrow">Account security</p>
    {state === 'error' ? <><div className="verification-symbol error-symbol" aria-hidden="true">!</div><h2>{reason === 'expired' ? 'Link expired' : 'Link not valid'}</h2><p className="text-muted">{reason === 'account' ? 'Sign in to the account that received this link, then open it again.' : 'Request a new verification email from your account.'}</p></>
      : verified ? <><div className="verification-symbol success-symbol" aria-hidden="true">✓</div><h2>Email verified successfully</h2><p className="text-muted">Your account is ready. Welcome to VYBE.</p><Link className="button primary continue-button" to="/">Continue to VYBE</Link></>
        : state === 'success' ? <><h2>Verification pending</h2><p className="text-muted">We could not confirm this link for your account. Check that you signed in to the account that received it.</p><Button onClick={() => void (firebaseMode ? verification.refetch() : auth.refetch())}>Check again</Button></>
        : <><div className="verification-symbol pending-symbol" aria-hidden="true">✉</div><h2>Verify your email</h2><p className="text-muted">Check <strong>{current?.email}</strong> for a verification link. {firebaseMode ? 'You can open it in another tab or browser.' : 'Open it in this browser while signed in. The link expires in 60 minutes.'}</p><p className="verification-help">No message yet? Check your spam folder, then use the resend button below.</p></>}
    {!verified && auth.data && <div className="verification-actions">
      <Button type="button" className="primary" disabled={resend.isPending || wait > 0} onClick={() => resend.mutate()}>{resend.isPending ? 'Sending…' : wait ? `Resend in ${wait}s` : 'Resend verification email'}</Button>
      {resend.isSuccess && <p role="status">Verification link sent. Check your inbox.</p>}
      {resend.isError && <p role="alert" className="field-error">{errorDetails(resend.error).message}</p>}
    </div>}
    {auth.data ? <div className="verification-footer"><Button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })}>{signOut.isPending ? 'Signing out…' : 'Sign out'}</Button>{signOut.isError && <p role="alert" className="field-error">{errorDetails(signOut.error).message}</p>}</div> : <p className="auth-switch"><Link to="/login">Sign in</Link></p>}
  </div>
}
