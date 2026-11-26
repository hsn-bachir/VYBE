import axios from 'axios'
import { api } from '../../../lib/api/client'
import { publicProfileId } from '../../profile/api/publicProfileApi'
import type { PublicCollection, PublicCollectionsResponse, PublicCollectionMoviesResponse } from '../types/publicCollection.types'

export function publicPage(value: string | null): number | null {
  const page = publicProfileId(value ?? '1')
  return page !== null && page <= 10000 ? page : null
}
function validate(id: number, page = 1) {
  if (publicProfileId(String(id)) !== id || publicPage(String(page)) !== page) throw new Error('Invalid collection link.')
}
export async function publicCollections(id: number, page: number, signal?: AbortSignal): Promise<PublicCollectionsResponse> {
  validate(id, page)
  return (await api.get<PublicCollectionsResponse>(`/api/v1/users/${id}/collections`, { params: { page, per_page: 20 }, signal })).data
}
export async function publicCollection(id: number, signal?: AbortSignal): Promise<PublicCollection> {
  validate(id)
  return (await api.get<{ data: PublicCollection }>(`/api/v1/collections/${id}`, { signal })).data.data
}
export async function publicCollectionMovies(id: number, page: number, signal?: AbortSignal): Promise<PublicCollectionMoviesResponse> {
  validate(id, page)
  return (await api.get<PublicCollectionMoviesResponse>(`/api/v1/collections/${id}/movies`, { params: { page, per_page: 20 }, signal })).data
}
export function publicCollectionFailure(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 404) return { title: 'Collection unavailable', message: 'This collection is not available to view.', retry: false, unavailable: true }
  if (status === 422) return { title: 'Invalid collection link', message: 'Check the link or choose another page.', retry: false, unavailable: false }
  if (status === 429) return { title: 'A moment between scenes', message: 'Too many requests. Please wait a minute before trying again.', retry: false, unavailable: false }
  return { title: 'Collections couldn’t load', message: 'Please try again when your connection is ready.', retry: true, unavailable: false }
}
