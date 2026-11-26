import axios from 'axios'
import { api } from '../../../lib/api/client'
import type { PublicProfile } from '../types/publicProfile.types'

export function publicProfileId(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return null
  const id = Number(value)
  return Number.isInteger(id) && id <= 2147483647 && String(id) === value ? id : null
}

export async function readPublicProfile(id: number, signal?: AbortSignal): Promise<PublicProfile> {
  if (publicProfileId(String(id)) !== id) throw new Error('Invalid public profile ID.')
  const { data } = (await api.get<{ data: PublicProfile }>(`/api/v1/users/${id}`, { signal })).data
  if (!data || data.id !== id || typeof data.username !== 'string' || !(data.avatar_url === null || typeof data.avatar_url === 'string')) {
    throw new Error('Public profile response is unavailable.')
  }
  return { id: data.id, username: data.username, avatar_url: data.avatar_url }
}

export function publicProfileFailure(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 404) return { title: 'Profile unavailable', message: 'This profile is not available to view.', retry: false }
  if (status === 422) return { title: 'Invalid profile link', message: 'Check the profile link and try another page.', retry: false }
  if (status === 429) return { title: 'A moment between scenes', message: 'Too many profile requests. Please wait a minute before trying again.', retry: false }
  return { title: 'This profile couldn’t load', message: 'Please try again when your connection is ready.', retry: true }
}
