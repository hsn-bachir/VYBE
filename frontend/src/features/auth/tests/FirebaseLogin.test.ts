import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { api } from '../../../lib/api/client'
import { firebaseLogin } from '../api/firebaseLogin'

vi.mock('firebase/app', () => ({ getApps: vi.fn(() => []), getApp: vi.fn(), initializeApp: vi.fn(() => ({})) }))
vi.mock('firebase/auth', () => ({
  inMemoryPersistence: {}, browserPopupRedirectResolver: {}, initializeAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(),
}))

const user = { id: 1, username: 'fan', email: 'fan@example.com', avatar_url: null, email_verified_at: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'public-test-key')
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'vybe-test.firebaseapp.com')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'vybe-test')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app')
  vi.mocked(signOut).mockResolvedValue(undefined)
  vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue('id-token') } } as never)
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: user } })
})

describe('one-time Firebase login', () => {
  it('exchanges the ID token after CSRF bootstrap and clears Firebase state', async () => {
    expect(await firebaseLogin({ email: user.email, password: 'secret' })).toEqual(user)
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), user.email, 'secret')
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/session', { id_token: 'id-token' })
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0])
    expect(signOut).toHaveBeenCalledOnce()
    expect(api.post).toHaveBeenCalledOnce()
  })

  it('clears temporary Firebase state if Laravel rejects the exchange', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('exchange failed'))
    await expect(firebaseLogin({ email: user.email, password: 'secret' })).rejects.toThrow('exchange failed')
    expect(signOut).toHaveBeenCalledOnce()
  })
})
