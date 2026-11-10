import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, errorDetails } from '../../../lib/api/client'
import { acceptInvitation, authenticate, completeFirebasePasswordReset, currentUser, logout, requestFirebasePasswordReset, resendVerification, verificationStatus } from '../api/authApi'
import { AuthForm } from '../components/AuthForm'
import { VerificationPage } from '../pages/VerificationPage'
import { Input } from '../../../components/ui/Input'
import { accessDestination } from '../guards/access'
import { VybeLogo } from '../../../components/branding/VybeLogo'
import { firebaseLogin } from '../api/firebaseLogin'
import { firebaseRegister } from '../api/firebaseRegistration'
import { FirebaseEmailActionPage } from '../pages/FirebaseEmailActionPage'
import { InvitationAcceptancePage } from '../pages/InvitationAcceptancePage'

vi.mock('../api/firebaseLogin', () => ({ firebaseLogin: vi.fn() }))
vi.mock('../api/firebaseRegistration', () => ({ firebaseRegister: vi.fn() }))

const user = { id: 1, username: 'movie_fan', email: 'fan@example.com', avatar_url: null, email_verified_at: null }
const failure = (status: number, errors = {}) => ({ isAxiosError: true, response: { status, data: { errors } } })
const credentials = { email: user.email, password: 'Cinema-lover123' }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('VITE_AUTH_IDENTITY_PROVIDER', 'legacy')
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: user } })
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: user } })
})

describe('authentication API and rendering', () => {
  it('uses the supplied full logo and compact symbol without repeating the wordmark', () => {
    const render = (variant: 'full' | 'symbol') => renderToStaticMarkup(<MemoryRouter><VybeLogo variant={variant} /></MemoryRouter>)
    expect(render('full')).toContain('vybe-logo-full')
    expect(render('symbol')).toContain('vybe-logo-symbol')
    expect(render('full')).toContain('aria-label="VYBE home"')
    expect(render('full')).not.toContain('VYBE<span>')
  })
  it('uses credentialed Axios and XSRF support', () => {
    expect(api.defaults.withCredentials).toBe(true)
    expect(api.defaults.withXSRFToken).toBe(true)
    expect(api.defaults.headers.Accept).toBe('application/json')
  })
  it('submits Firebase invitations to the Firebase acceptance endpoint', async () => {
    vi.stubEnv('VITE_AUTH_IDENTITY_PROVIDER', 'firebase')
    const values = { email: 'invited@example.test', token: 'a'.repeat(64), password: 'New-password123', password_confirmation: 'New-password123' }
    await acceptInvitation(values)
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/invitations/accept', values)
    const existing = { email: 'existing@example.test', token: 'b'.repeat(64), id_token: 'fresh-firebase-token' }
    await acceptInvitation(existing)
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/invitations/accept', existing)
  })
  it('offers existing Firebase invitees their current sign-in methods', () => {
    vi.stubEnv('VITE_AUTH_IDENTITY_PROVIDER', 'firebase')
    vi.stubGlobal('window', { location: { hash: `#email=existing%40example.test&token=${'b'.repeat(64)}&existing=1` } })
    const html = renderToStaticMarkup(<MemoryRouter><InvitationAcceptancePage /></MemoryRouter>)
    expect(html).toContain('Sign in to your existing Firebase account')
    expect(html).toContain('GitHub')
    expect(html).toContain('Google')
    expect(html).not.toContain('Confirm password')
    vi.unstubAllGlobals()
  })

  it.each(['login', 'register'] as const)('bootstraps CSRF before %s and returns the server user', async mode => {
    const result = await authenticate(mode, credentials)
    expect(result).toEqual(user)
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith(`/api/v1/auth/${mode}`, credentials)
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0])
  })

  it('never submits credentials when CSRF bootstrap fails', async () => {
    vi.mocked(api.get).mockRejectedValue(failure(500))
    await expect(authenticate('login', credentials)).rejects.toMatchObject({ response: { status: 500 } })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('uses Firebase exchange for login in Firebase mode without a legacy password request', async () => {
    vi.stubEnv('VITE_AUTH_IDENTITY_PROVIDER', 'firebase')
    vi.mocked(firebaseLogin).mockResolvedValue(user)
    expect(await authenticate('login', credentials)).toEqual(user)
    expect(firebaseLogin).toHaveBeenCalledWith(credentials)
    expect(api.post).not.toHaveBeenCalled()
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AuthForm mode="register" /></MemoryRouter></QueryClientProvider>)
    expect(html).toContain('Create account')
    expect(html).not.toContain('Coming soon')
    vi.mocked(firebaseRegister).mockResolvedValue(user)
    expect(await authenticate('register', { ...credentials, username: 'movie_fan', password_confirmation: credentials.password })).toEqual(user)
    expect(firebaseRegister).toHaveBeenCalled()
  })

  it('restores the user from the backend and forwards cancellation', async () => {
    const controller = new AbortController()
    expect(await currentUser(controller.signal)).toEqual(user)
    expect(api.get).toHaveBeenCalledWith('/api/v1/auth/me', { signal: controller.signal })
  })

  it('treats only 401 as an unauthenticated session', async () => {
    vi.mocked(api.get).mockRejectedValue(failure(401))
    expect(await currentUser()).toBeNull()
    vi.mocked(api.get).mockRejectedValue(failure(500))
    await expect(currentUser()).rejects.toMatchObject({ response: { status: 500 } })
  })

  it.each([
    { isAxiosError: true, code: 'ERR_NETWORK' },
    { isAxiosError: true, code: 'ECONNABORTED' },
    failure(503),
  ])('keeps a failed session check recoverable instead of signing the user out: %j', async error => {
    vi.mocked(api.get).mockRejectedValueOnce(error)
    await expect(currentUser()).rejects.toBe(error)
    expect(await currentUser()).toEqual(user)
  })

  it('bootstraps logout and accepts an already-expired session', async () => {
    vi.mocked(api.post).mockRejectedValue(failure(401))
    await expect(logout()).resolves.toBeUndefined()
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/logout')
  })

  it('does not claim logout succeeded on CSRF or server errors', async () => {
    vi.mocked(api.post).mockRejectedValue(failure(419))
    await expect(logout()).rejects.toMatchObject({ response: { status: 419 } })
  })

  it.each([[401, 'Invalid email or password.'], [419, 'Your session expired.'], [429, 'Too many attempts.'], [500, 'The server could not complete this request.'], [503, 'The service is temporarily unavailable.']])('maps %i to safe feedback', (status, message) => {
    expect(errorDetails(failure(status as number)).message).toContain(message as string)
  })

  it('distinguishes a network failure from an HTTP server failure without exposing server details', () => {
    expect(errorDetails({ isAxiosError: true, code: 'ERR_NETWORK' }).message).toContain('Unable to connect.')
    expect(errorDetails({ isAxiosError: true, response: { status: 500, data: { message: 'SQLSTATE sensitive details' } } }).message).not.toMatch(/Unable to connect|SQLSTATE/)
  })

  it('preserves field errors from Laravel validation', () => {
    expect(errorDetails(failure(422, { email: ['Email already taken.'] })).fields.email).toEqual(['Email already taken.'])
  })

  it.each(['login', 'register'] as const)('renders accessible %s fields and disabled OAuth options', mode => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AuthForm mode={mode} /></MemoryRouter></QueryClientProvider>)
    expect(html).toContain('for="email"')
    expect(html).toContain('type="password"')
    expect(html).toContain('aria-label="Show password"')
    expect(html.match(/Coming soon/g)).toHaveLength(2)
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    if (mode === 'register') {
      expect(html).toContain('name="username"')
      expect(html).toContain('name="password_confirmation"')
    }
  })

  it('associates field errors with the input', () => {
    const html = renderToStaticMarkup(<Input name="email" label="Email" error="Invalid email" />)
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="email-help"')
    expect(html).toContain('id="email-help"')
  })

  it('reads verification status from the backend', async () => {
    expect(await verificationStatus()).toEqual(user)
    expect(api.get).toHaveBeenCalledWith('/api/v1/auth/email/verification-status')
  })

  it('bootstraps CSRF before resending verification', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { message: 'Verification link sent.' } })
    expect(await resendVerification()).toBe('Verification link sent.')
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/email/verification-notification')
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0])
  })

  it('sends Firebase password recovery requests through Core with CSRF', async () => {
    await requestFirebasePasswordReset('fan@example.com')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/password/forgot', { email: 'fan@example.com' })
    const values = { oob_code: 'one-time-code', password: 'New-password123', password_confirmation: 'New-password123' }
    await completeFirebasePasswordReset(values)
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/password/reset', values)
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('/sanctum/csrf-cookie')
  })

  it('routes Firebase email actions by mode and rejects unsupported links', () => {
    const render = (mode: string) => {
      vi.stubGlobal('window', { location: { search: `?mode=${mode}&oobCode=test-code` } })
      return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FirebaseEmailActionPage /></MemoryRouter></QueryClientProvider>)
    }
    expect(render('verifyEmail')).toContain('Checking email link')
    expect(render('recoverEmail')).toContain('Checking email link')
    expect(render('resetPassword')).toContain('Choose a new password')
    expect(render('unsupported')).toContain('Link not valid')
    vi.unstubAllGlobals()
  })

  it('bootstraps CSRF before accepting an invitation without changing auth state', async () => {
    const values = { email: user.email, token: 'a'.repeat(64), password: 'longPassword123', password_confirmation: 'longPassword123' }
    await acceptInvitation(values)
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/invitations/accept', values)
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0])
  })

  it('renders pending email, resend action, and an invalid-link explanation', () => {
    const client = new QueryClient()
    client.setQueryData(['auth', 'me'], user)
    const render = (state: 'pending' | 'error') => renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><VerificationPage state={state} /></MemoryRouter></QueryClientProvider>)
    expect(render('pending')).toContain('fan@example.com')
    expect(render('pending')).toContain('Resend verification email')
    expect(render('error')).toContain('Link not valid')
  })

  it('checks the server before showing verification success', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    client.setQueryData(['auth', 'me'], user)
    const render = () => renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><VerificationPage state="success" /></MemoryRouter></QueryClientProvider>)
    expect(render()).toContain('Checking verification status')
    expect(render()).not.toContain('<h2>Email verified</h2>')
  })

  it('keeps public browsing open to guests and routes unverified accounts to verification', () => {
    expect(accessDestination(null, false)).toBeNull()
    expect(accessDestination(null, true)).toBe('/login')
    expect(accessDestination(user, false)).toBe('/verify-email')
    expect(accessDestination(user, true)).toBe('/verify-email')
    expect(accessDestination({ ...user, email_verified_at: '2026-10-23T00:00:00.000Z' }, true)).toBeNull()
  })
})
