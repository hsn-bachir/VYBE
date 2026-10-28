import axios from 'axios'
import { api } from '../../../lib/api/client'
import type { MovieDetailResponse, MovieListResponse } from '../types/movie.types'

export async function popularMovies(page: number, signal?: AbortSignal) {
  return (await api.get<MovieListResponse>('/api/v1/movies/popular', { params: { page }, signal })).data
}
export async function searchMovies(query: string, page: number, signal?: AbortSignal) {
  return (await api.get<MovieListResponse>('/api/v1/movies/search', { params: { query, page }, signal })).data
}
export async function movieDetails(id: string, signal?: AbortSignal) {
  return (await api.get<MovieDetailResponse>(`/api/v1/movies/${id}`, { signal })).data
}
export function movieError(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 404) return 'This movie could not be found.'
  if (status === 422) return 'Check your search or page number and try again.'
  return 'The cinema is a little quiet right now. We couldn’t load the movies. Please try again.'
}
