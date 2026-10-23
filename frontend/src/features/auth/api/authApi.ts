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
