import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'
import type { Review, ReviewOperation, ReviewsResponse } from '../types/review.types'

export async function reviewsPage(movie: number, page: number, perPage: number, signal?: AbortSignal): Promise<ReviewsResponse> {
  return (await api.get<ReviewsResponse>(`/api/v1/movies/${movie}/reviews`, { params: { page, per_page: perPage }, signal })).data
}
export async function personalReview(movie: number, signal?: AbortSignal): Promise<Review | null> {
  return (await api.get<{ data: Review | null }>(`/api/v1/me/reviews/${movie}`, { signal })).data.data
}
export async function changeReview(movie: number, operation: ReviewOperation, isCurrent: () => boolean): Promise<Review | null> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed.')
  const path = `/api/v1/movies/${movie}/reviews`
  if (operation.action === 'create') return (await api.post<{ data: Review }>(path, operation.values)).data.data
  if (operation.action === 'edit') return (await api.patch<{ data: Review }>(`${path}/${operation.id}`, operation.values)).data.data
  await api.delete(`${path}/${operation.id}`)
  return null
}
export function reviewStatus(error: unknown): number | undefined { return axios.isAxiosError(error) ? error.response?.status : undefined }
export function reviewError(error: unknown, writing = false): string {
  const status = reviewStatus(error)
  if (status === 401) return 'Sign in again to manage your review.'
  if (status === 403) return 'Verify your email to write reviews.'
  if (status === 404) return 'This review is no longer available.'
  if (status === 409) return 'You already have a review for this movie. Your draft is preserved. Open your existing review to edit it.'
  if (status === 503) return writing ? 'The service is temporarily unavailable. Please try again. Your draft is kept here.' : 'Reviews are temporarily unavailable. Please try again.'
  return errorDetails(error).message
}
