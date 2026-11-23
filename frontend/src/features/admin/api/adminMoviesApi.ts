import { api } from '../../../lib/api/client'
import type { MovieDetails } from '../../movies/types/movie.types'

export type ManagedMovie = Omit<MovieDetails, 'genres'> & {
  genres: { id: number; name: string }[] | null
  metadata_status: 'fresh' | 'stale' | 'not_hydrated'
  metadata_fetched_at: string | null
}
export type MovieFilters = { q: string; status: string; page: number }
export type ManagedMovies = { data: ManagedMovie[]; meta: { page: number; total_pages: number; total_results: number } }
export async function managedMovies(filters: MovieFilters, signal?: AbortSignal): Promise<ManagedMovies> {
  return (await api.get<ManagedMovies>('/api/v1/admin/movies', { params: filters, signal })).data
}
export async function managedMovie(id: number, signal?: AbortSignal): Promise<ManagedMovie> {
  return (await api.get<{ data: ManagedMovie }>(`/api/v1/admin/movies/${id}`, { signal })).data.data
}
export async function refreshMovie(id: number, current: () => boolean): Promise<ManagedMovie> {
  await api.get('/sanctum/csrf-cookie')
  if (!current()) throw new Error('The signed-in account changed.')
  return (await api.post<{ data: ManagedMovie }>(`/api/v1/admin/movies/${id}/refresh`)).data.data
}
