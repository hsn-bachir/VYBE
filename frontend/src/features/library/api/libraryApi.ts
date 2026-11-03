import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'
import type { LibraryKind, LibraryResponse, LibraryState, Membership } from '../types/library.types'

export async function libraryPage(kind: LibraryKind, page: number, signal?: AbortSignal) {
  return (await api.get<LibraryResponse>(`/api/v1/me/${kind}`, { params: { page, per_page: 20 }, signal })).data
}
export async function libraryState(id: number, signal?: AbortSignal) {
  return (await api.get<{ data: LibraryState }>(`/api/v1/me/movies/${id}/library-state`, { signal })).data.data
}
export async function changeMembership(kind: LibraryKind, id: number, add: boolean, isCurrent = () => true): Promise<Membership | null> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please try again.')
  if (add) return (await api.post<{ data: Membership }>(`/api/v1/me/${kind}`, { tmdb_id: id })).data.data
  await api.delete(`/api/v1/me/${kind}/${id}`)
  return null
}
export function libraryError(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) return 'Sign in again to access your library.'
  if (status === 403) return 'Verify your email to use your library.'
  if (status === 422) return 'This movie could not be saved. Open its details and try again.'
  if (status === 503) return 'Movie information is temporarily unavailable. Please try again shortly.'
  return errorDetails(error).message
}
