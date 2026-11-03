import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'
import type { Profile, ProfileOperation } from '../types/profile.types'
const path = '/api/v1/me/profile'
export async function readProfile(signal?: AbortSignal): Promise<Profile> { return (await api.get<{ data: Profile }>(path, { signal })).data.data }
export async function changeProfile(operation: ProfileOperation, isCurrent: () => boolean): Promise<Profile> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed.')
  if (operation.action === 'edit') return (await api.patch<{ data: Profile }>(path, operation.values)).data.data
  if (operation.action === 'remove') return (await api.delete<{ data: Profile }>(`${path}/avatar`)).data.data
  const body = new FormData(); body.append('avatar', operation.file)
  return (await api.post<{ data: Profile }>(`${path}/avatar`, body)).data.data
}
export function profileError(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) return 'Sign in again to manage your profile.'
  if (status === 403) return 'Verify your email to manage your profile.'
  if (status === 413) return 'Choose an image smaller than 2 MiB.'
  return errorDetails(error).message
}
export function avatarFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size > 2 * 1024 * 1024) return 'Choose an image no larger than 2 MiB.'
  if (!file.size) return 'This image is empty.'
  return null
}
