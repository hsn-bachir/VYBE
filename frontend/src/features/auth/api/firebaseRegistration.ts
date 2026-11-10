import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth'
import { api } from '../../../lib/api/client'
import type { Registration, User } from '../types/auth.types'
import { firebaseAuth } from './firebaseClient'

export async function firebaseRegister(values: Registration): Promise<User> {
  const firebase = firebaseAuth()
  const email = values.email.trim().toLowerCase()
  if (firebase.currentUser && firebase.currentUser.email?.toLowerCase() !== email) {
    await signOut(firebase)
  }
  const identity = firebase.currentUser?.email?.toLowerCase() === email
    ? firebase.currentUser
    : (await createUserWithEmailAndPassword(firebase, email, values.password)).user

  // Keep the in-memory Firebase identity on SQL validation failure so the user
  // can correct the username without creating a second Firebase account.
  const idToken = await identity.getIdToken()
  await api.get('/sanctum/csrf-cookie')
  const user = (await api.post<{ data: User }>('/api/v1/auth/firebase/register', {
    id_token: idToken, username: values.username,
  })).data.data
  if (!user.email_verified_at) {
    try {
      await sendEmailVerification(identity, {
        url: `${window.location.origin}/verify-email/success`, handleCodeInApp: false,
      })
    } catch {
      // The pending screen offers a server-side resend that needs no Firebase user.
    }
  }
  await signOut(firebase).catch(() => undefined)
  return user
}
