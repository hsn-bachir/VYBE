import axios from 'axios'
import { api } from '../../../lib/api/client'
import type { Credentials, Registration, User } from '../types/auth.types'

export async function verificationStatus() {
  return (await api.get<{ data: User }>('/api/v1/auth/email/verification-status')).data.data
}

export async function resendVerification() {
  await api.get('/sanctum/csrf-cookie')
  return (await api.post<{ message: string }>('/api/v1/auth/email/verification-notification')).data.message
}

export async function currentUser(signal?: AbortSignal): Promise<User | null> {
  try {
    return (await api.get<{ data: User }>('/api/v1/auth/me', { signal })).data.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) return null
    throw error
  }
}

export async function authenticate(mode: 'login' | 'register', values: Credentials | Registration) {
  if (mode === 'login' && import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase') {
    const { firebaseLogin } = await import('./firebaseLogin')
    return firebaseLogin(values)
  }
  if (mode === 'register' && import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase') {
    const { firebaseRegister } = await import('./firebaseRegistration')
    return firebaseRegister(values as Registration)
  }
  await api.get('/sanctum/csrf-cookie')
  return (await api.post<{ data: User }>(`/api/v1/auth/${mode}`, values)).data.data
}

export async function logout() {
  await api.get('/sanctum/csrf-cookie')
  try {
    await api.post('/api/v1/auth/logout')
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error
  }
}

export async function acceptInvitation(values: { email: string; token: string } &
  ({ password: string; password_confirmation: string; id_token?: never } | { id_token: string; password?: never; password_confirmation?: never })): Promise<void> {
  await api.get('/sanctum/csrf-cookie')
  await api.post(import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase'
    ? '/api/v1/auth/firebase/invitations/accept' : '/api/v1/auth/invitations/accept', values)
}

export async function completePasswordReset(values: { email: string; token: string; password: string; password_confirmation: string }): Promise<void> {
  await api.get('/sanctum/csrf-cookie')
  await api.post('/api/v1/auth/password/reset', values)
}

export async function requestFirebasePasswordReset(email: string): Promise<void> {
  await api.get('/sanctum/csrf-cookie')
  await api.post('/api/v1/auth/firebase/password/forgot', { email })
}

export async function completeFirebasePasswordReset(values: { oob_code: string; password: string; password_confirmation: string }): Promise<void> {
  await api.get('/sanctum/csrf-cookie')
  await api.post('/api/v1/auth/firebase/password/reset', values)
}
