import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'
import type { LibraryResponse } from '../../library/types/library.types'
import type { Collection, CollectionOperation, CollectionsResponse } from '../types/collection.types'

const path = '/api/v1/me/collections'
export async function collectionsPage(page: number, containsTmdbId?: number, signal?: AbortSignal, includePreviews = true) {
  return (await api.get<CollectionsResponse>(path, { params: { page, per_page: 20, contains_tmdb_id: containsTmdbId, include_previews: includePreviews ? undefined : 0 }, signal })).data
}
export async function collectionDetails(id: number, signal?: AbortSignal) {
  return (await api.get<{ data: Collection }>(`${path}/${id}`, { signal })).data.data
}
export async function collectionMovies(id: number, page: number, signal?: AbortSignal) {
  return (await api.get<LibraryResponse>(`${path}/${id}/movies`, { params: { page, per_page: 20 }, signal })).data
}
export async function changeCollection(operation: CollectionOperation, isCurrent: () => boolean): Promise<Collection | null> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed.')
  if (operation.action === 'create') return (await api.post<{ data: Collection }>(path, operation.values)).data.data
  const url = `${path}/${operation.id}`
  if (operation.action === 'edit') return (await api.patch<{ data: Collection }>(url, operation.values)).data.data
  if (operation.action === 'delete') await api.delete(url)
  else if (operation.add) await api.post(`${url}/movies`, { tmdb_id: operation.tmdbId })
  else await api.delete(`${url}/movies/${operation.tmdbId}`)
  return null
}
export function collectionError(error: unknown, membership = false) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) return 'Sign in again to access your collections.'
  if (status === 403) return 'Verify your email to use your collections.'
  if (status === 404) return 'This collection is no longer available.'
  if (status === 503) return 'Movie information is temporarily unavailable. Please try again shortly.'
  if (status === 422 && membership) return 'This movie could not be saved. Open its details and try again.'
  return errorDetails(error).message
}
