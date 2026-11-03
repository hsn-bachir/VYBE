import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'
import type { PersonalRating, RatingOperation, RatingStatistics } from '../types/rating.types'

export async function ratingStatistics(id: number, signal?: AbortSignal): Promise<RatingStatistics> {
  return (await api.get<{ data: RatingStatistics }>(`/api/v1/movies/${id}/ratings`, { signal })).data.data
}
export async function personalRating(id: number, signal?: AbortSignal): Promise<PersonalRating | null> {
  return (await api.get<{ data: PersonalRating | null }>(`/api/v1/me/ratings/${id}`, { signal })).data.data
}
export async function changeRating(id: number, operation: RatingOperation, isCurrent: () => boolean): Promise<PersonalRating | null> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed.')
  if (operation.action === 'put') return (await api.put<{ data: PersonalRating }>(`/api/v1/me/ratings/${id}`, { rating: operation.rating })).data.data
  await api.delete(`/api/v1/me/ratings/${id}`)
  return null
}
export function ratingError(error: unknown, write = false): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) return 'Sign in again to manage your rating.'
  if (status === 403) return 'Verify your email to rate movies.'
  if (status === 422) return 'This rating could not be saved. Open the movie details and choose 1–5 stars.'
  if (status === 503) return write ? 'Movie information is temporarily unavailable. Your rating was not saved. Please try again.' : 'Ratings are temporarily unavailable. Please try again.'
  return errorDetails(error).message
}
