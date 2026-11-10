import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { api } from '../../../lib/api/client'
import type { Credentials, User } from '../types/auth.types'
import { firebaseAuth } from './firebaseClient'

export async function firebaseLogin(values: Credentials): Promise<User> {
  const firebase = firebaseAuth()
  try {
    const credential = await signInWithEmailAndPassword(firebase, values.email, values.password)
    const idToken = await credential.user.getIdToken()
    await api.get('/sanctum/csrf-cookie')
    return (await api.post<{ data: User }>('/api/v1/auth/firebase/session', { id_token: idToken })).data.data
  } finally {
    // This clears the temporary Firebase state; Laravel's cookie is independent.
    await signOut(firebase).catch(() => undefined)
  }
}
