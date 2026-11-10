import { beforeEach, describe, expect, it, vi } from 'vitest'
import { linkWithPopup, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth'
import { api, errorDetails } from '../../../lib/api/client'
import { completeSocialRegistration, firebaseSocialSignIn, linkSocialProvider, reauthenticateForLink } from '../api/firebaseSocial'

const state = vi.hoisted(() => ({ currentUser: null as null | { email: string; getIdToken: () => Promise<string> } }))
vi.mock('firebase/app', () => ({ getApps: vi.fn(() => []), getApp: vi.fn(), initializeApp: vi.fn(() => ({})) }))
vi.mock('firebase/auth', () => ({
  inMemoryPersistence: {}, browserPopupRedirectResolver: {}, initializeAuth: vi.fn(() => state),
  GoogleAuthProvider: class { providerId = 'google.com' },
  GithubAuthProvider: class { providerId = 'github.com'; addScope = vi.fn() },
  signInWithPopup: vi.fn(), signInWithEmailAndPassword: vi.fn(), linkWithPopup: vi.fn(), signOut: vi.fn(), sendEmailVerification: vi.fn(),
}))

const firebaseUser = { email: 'social@example.com', getIdToken: vi.fn(async () => 'id-token') }
const vybeUser = { id: 7, username: 'social_user', email: 'social@example.com', avatar_url: null, email_verified_at: '2026-11-08T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'public-test-key')
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'vybe-test.firebaseapp.com')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'vybe-test')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app')
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
  state.currentUser = null
  vi.mocked(signInWithPopup).mockImplementation(async () => { state.currentUser = firebaseUser; return { user: firebaseUser } as never })
  vi.mocked(signInWithEmailAndPassword).mockImplementation(async () => { state.currentUser = firebaseUser; return { user: firebaseUser } as never })
  vi.mocked(signOut).mockImplementation(async () => { state.currentUser = null })
  vi.mocked(linkWithPopup).mockResolvedValue({ user: firebaseUser } as never)
  vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockResolvedValue({ status: 200, data: { data: vybeUser } })
})

describe('Firebase social authentication', () => {
  it('keeps a new Google identity only for username onboarding', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ status: 202, data: { code: 'USERNAME_REQUIRED' } })
    expect(await firebaseSocialSignIn('google.com')).toEqual({ kind: 'onboarding' })
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/social/session', { id_token: 'id-token', provider: 'google.com' })
    expect(state.currentUser).toBe(firebaseUser)
    expect(signOut).not.toHaveBeenCalled()
    expect(await completeSocialRegistration('chosen_name')).toEqual(vybeUser)
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/register', { id_token: 'id-token', username: 'chosen_name' })
    expect(state.currentUser).toBeNull()
  })

  it('requests Firebase verification when a new social email is unverified', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ status: 202, data: { code: 'USERNAME_REQUIRED' } })
    await firebaseSocialSignIn('github.com')
    vi.mocked(api.post).mockResolvedValueOnce({ status: 201, data: { data: { ...vybeUser, email_verified_at: null } } })
    await completeSocialRegistration('social_user')
    expect(sendEmailVerification).toHaveBeenCalledOnce()
    expect(state.currentUser).toBeNull()
  })

  it('exchanges an existing GitHub identity and clears Firebase state', async () => {
    expect(await firebaseSocialSignIn('github.com')).toEqual({ kind: 'signed_in', user: vybeUser })
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/social/session', { id_token: 'id-token', provider: 'github.com' })
    expect(signOut).toHaveBeenCalledOnce()
    expect(state.currentUser).toBeNull()
  })

  it('clears temporary state after popup cancellation or Core conflict', async () => {
    vi.mocked(signInWithPopup).mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' })
    await expect(firebaseSocialSignIn('google.com')).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' })
    expect(errorDetails({ code: 'auth/popup-closed-by-user' }).message).toContain('cancelled')
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { code: 'IDENTITY_CONFLICT' } } })
    await expect(firebaseSocialSignIn('github.com')).rejects.toMatchObject({ response: { status: 409 } })
    expect(state.currentUser).toBeNull()
  })

  it('requires confirmation of the current Firebase identity before linking', async () => {
    await reauthenticateForLink('password', 'social@example.com', 'fixture-password')
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'social@example.com', 'fixture-password')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/link/authorize', { id_token: 'id-token' })
    await linkSocialProvider('google.com')
    expect(linkWithPopup).toHaveBeenCalledOnce()
    expect(state.currentUser).toBeNull()
  })

  it('clears Firebase state when current-account confirmation fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, data: { code: 'IDENTITY_MISMATCH' } } })
    await expect(reauthenticateForLink('google.com', 'social@example.com')).rejects.toMatchObject({ response: { status: 403 } })
    expect(state.currentUser).toBeNull()
    expect(linkWithPopup).not.toHaveBeenCalled()
  })

  it('surfaces provider conflicts and missing email without automatic account linking', () => {
    expect(errorDetails({ code: 'auth/account-exists-with-different-credential' }).message).toContain('another sign-in method')
    expect(errorDetails({ code: 'auth/credential-already-in-use' }).message).toContain('another Firebase account')
    expect(errorDetails({ isAxiosError: true, response: { status: 422, data: { code: 'EMAIL_REQUIRED' } } }).message).toContain('usable email')
  })
})
