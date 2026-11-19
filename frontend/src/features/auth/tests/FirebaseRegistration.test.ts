import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth'
import { api } from '../../../lib/api/client'
import { firebaseRegister } from '../api/firebaseRegistration'

const authState = vi.hoisted(() => ({ currentUser: null as null | { email: string; getIdToken: () => Promise<string> } }))
vi.mock('firebase/app', () => ({ getApps: vi.fn(() => []), getApp: vi.fn(), initializeApp: vi.fn(() => ({})) }))
vi.mock('firebase/auth', () => ({
  inMemoryPersistence: {}, browserPopupRedirectResolver: {}, initializeAuth: vi.fn(() => authState),
  createUserWithEmailAndPassword: vi.fn(), sendEmailVerification: vi.fn(), signOut: vi.fn(),
}))

const registration = { username: 'movie_fan', email: 'fan@example.com', password: 'Cinema-lover123', password_confirmation: 'Cinema-lover123' }
const user = { id: 1, username: 'movie_fan', email: 'fan@example.com', avatar_url: null, email_verified_at: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'public-test-key')
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'vybe-test.firebaseapp.com')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'vybe-test')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app')
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
  authState.currentUser = null
  vi.mocked(createUserWithEmailAndPassword).mockImplementation(async (_auth, email) => {
    authState.currentUser = { email, getIdToken: async () => 'id-token' }
    return { user: authState.currentUser } as never
  })
  vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
  vi.mocked(signOut).mockImplementation(async () => { authState.currentUser = null })
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: user } })
})

describe('Firebase registration', () => {
  it('creates Firebase identity, exchanges proof and username, and sends verification', async () => {
    expect(await firebaseRegister(registration)).toEqual(user)
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), registration.email, registration.password)
    expect(api.get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/firebase/register', { id_token: 'id-token', username: registration.username })
    expect(sendEmailVerification).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()
    expect(authState.currentUser).toBeNull()
  })

  it('keeps the temporary Firebase identity for a corrected username retry', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('username taken'))
    await expect(firebaseRegister(registration)).rejects.toThrow('username taken')
    expect(signOut).not.toHaveBeenCalled()
    await expect(firebaseRegister({ ...registration, username: 'another_name' })).resolves.toEqual(user)
    expect(createUserWithEmailAndPassword).toHaveBeenCalledOnce()
    expect(api.post).toHaveBeenLastCalledWith('/api/v1/auth/firebase/register', { id_token: 'id-token', username: 'another_name' })
  })
})
