import { GithubAuthProvider, GoogleAuthProvider, linkWithPopup, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth'
import { api } from '../../../lib/api/client'
import type { User as VybeUser } from '../types/auth.types'
import { firebaseAuth } from './firebaseClient'

export type SocialProvider = 'google.com' | 'github.com'
export type SocialResult = { kind: 'onboarding' } | { kind: 'signed_in'; user: VybeUser }

function providerFor(name: SocialProvider) {
  if (name === 'google.com') return new GoogleAuthProvider()
  const github = new GithubAuthProvider()
  github.addScope('user:email')
  return github
}

async function csrf() { await api.get('/sanctum/csrf-cookie') }

export async function firebaseSocialSignIn(provider: SocialProvider): Promise<SocialResult> {
  const auth = firebaseAuth()
  if (auth.currentUser) await signOut(auth)
  let onboarding = false
  try {
    const { user } = await signInWithPopup(auth, providerFor(provider))
    const idToken = await user.getIdToken()
    await csrf()
    const result = await api.post<{ code?: string; data?: VybeUser }>('/api/v1/auth/firebase/social/session', {
      id_token: idToken, provider,
    })
    if (result.status === 202 && result.data.code === 'USERNAME_REQUIRED') {
      onboarding = true
      return { kind: 'onboarding' }
    }
    if (!result.data.data) throw new Error('Unexpected social sign-in response.')
    return { kind: 'signed_in', user: result.data.data }
  } finally {
    // Only an unfinished username choice keeps the temporary Firebase user.
    if (!onboarding) await signOut(auth).catch(() => undefined)
  }
}

export async function completeSocialRegistration(username: string): Promise<VybeUser> {
  const auth = firebaseAuth()
  const identity = auth.currentUser
  if (!identity) throw new Error('Social sign-in expired. Start again from the sign-in page.')
  const idToken = await identity.getIdToken()
  await csrf()
  const user = (await api.post<{ data: VybeUser }>('/api/v1/auth/firebase/register', {
    id_token: idToken, username,
  })).data.data
  if (!user.email_verified_at) {
    try {
      await sendEmailVerification(identity, {
        url: `${window.location.origin}/verify-email/success`, handleCodeInApp: false,
      })
    } catch { /* The pending screen offers a server-side resend. */ }
  }
  await signOut(auth).catch(() => undefined)
  return user
}

export async function reauthenticateForLink(method: 'password' | SocialProvider, email: string, password?: string): Promise<void> {
  const auth = firebaseAuth()
  if (auth.currentUser) await signOut(auth)
  try {
    const identity: User = method === 'password'
      ? (await signInWithEmailAndPassword(auth, email, password ?? '')).user
      : (await signInWithPopup(auth, providerFor(method))).user
    const idToken = await identity.getIdToken()
    await csrf()
    await api.post('/api/v1/auth/firebase/link/authorize', { id_token: idToken })
  } catch (error) {
    await signOut(auth).catch(() => undefined)
    throw error
  }
}

export async function linkSocialProvider(provider: SocialProvider): Promise<void> {
  const auth = firebaseAuth()
  if (!auth.currentUser) throw new Error('Confirm your current sign-in method first.')
  await linkWithPopup(auth.currentUser, providerFor(provider))
  await signOut(auth).catch(() => undefined)
}

export async function cancelSocialLink(): Promise<void> {
  await signOut(firebaseAuth()).catch(() => undefined)
}

export async function freshFirebaseIdentityToken(method: 'password' | SocialProvider, email: string, password?: string): Promise<string> {
  const auth = firebaseAuth()
  if (auth.currentUser) await signOut(auth)
  try {
    const user = method === 'password'
      ? (await signInWithEmailAndPassword(auth, email, password ?? '')).user
      : (await signInWithPopup(auth, providerFor(method))).user
    return await user.getIdToken(true)
  } finally {
    await signOut(auth).catch(() => undefined)
  }
}
