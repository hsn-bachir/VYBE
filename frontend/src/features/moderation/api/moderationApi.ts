import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'
import type { MovieSummary } from '../../movies/types/movie.types'

export type ReportReason = 'harassment' | 'hate' | 'spam' | 'spoiler' | 'other'
export type ReportStatus = 'pending' | 'resolved' | 'dismissed'
export type ModerationReview = {
  id: number; tmdb_id: number; author: { id: number; username: string } | null; body?: string; body_preview?: string; pending_report_count?: number
  visibility: 'visible' | 'hidden'; author_contains_spoilers: boolean; moderator_spoiler: boolean
  contains_spoilers: boolean; created_at: string; updated_at: string
}
export type Report = {
  id: number; target_type: 'review'; target_id: number; reason: ReportReason; description: string | null
  status: ReportStatus; resolved_by: number | null; resolved_at: string | null
  resolution_note: string | null; resolution_action: 'hide' | 'mark_spoiler' | null
  created_at: string; updated_at: string; reporter: { id: number; username: string } | null
  target_available: boolean; review?: ModerationReview
}
export type Action = {
  id: number; actor: { id: number; username: string } | null; action: string
  target_type: string; target_id: number; reason: string | null
  details: Record<string, unknown> | null; created_at: string
}
export type Page<T> = { data: T[]; meta: { page: number; per_page: number; total_pages: number; total_results: number } }
export type AdminOverview = { pending_reports: number; handled_reports: number; hidden_reviews: number; enforced_spoilers: number
  recent_reports: { id: number; review_id: number; reason: ReportReason; status: ReportStatus; created_at: string }[]
  users?: { total: number; restricted: number; banned: number; deactivated: number } }
export type ReportFilters = { page: number; per_page: number; status: ReportStatus | 'all'; target_id?: string }
export type ReviewFilters = { page: number; per_page: number; visibility: '' | 'visible' | 'hidden'; tmdb_id: string
  scope?: 'needs_attention' | 'actioned' | 'all'; actioned_type?: '' | 'hidden' | 'spoiler' }
export type MovieSummaries = { data: MovieSummary[]; meta: { missing_tmdb_ids: number[] } }

const root = '/api/v1/admin'
export async function overview(signal?: AbortSignal): Promise<AdminOverview> {
  return (await api.get<{ data: AdminOverview }>(`${root}/overview`, { signal })).data.data
}
export async function movieSummaries(ids: number[], signal?: AbortSignal): Promise<MovieSummaries> {
  return (await api.get<MovieSummaries>(`${root}/movie-summaries`, { params: { tmdb_ids: ids }, signal })).data
}
export async function submitReport(movie: number, review: number, values: { reason: ReportReason; description?: string }, isCurrent: () => boolean) {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  const response = await api.post<{ data: Pick<Report, 'id' | 'status'> }>(`/api/v1/movies/${movie}/reviews/${review}/reports`, values)
  return { report: response.data.data, created: response.status === 201 }
}
export async function reports(filters: ReportFilters, signal?: AbortSignal): Promise<Page<Report>> {
  return (await api.get<Page<Report>>(`${root}/reports`, { params: { ...filters, compact: 1 }, signal })).data
}
export async function report(id: number, signal?: AbortSignal): Promise<Report> {
  return (await api.get<{ data: Report }>(`${root}/reports/${id}`, { signal })).data.data
}
export async function reviews(filters: ReviewFilters, signal?: AbortSignal): Promise<Page<ModerationReview>> {
  return (await api.get<Page<ModerationReview>>(`${root}/reviews`, { params: { ...filters, visibility: filters.visibility || undefined, tmdb_id: filters.tmdb_id || undefined, actioned_type: filters.actioned_type || undefined, compact: 1 }, signal })).data
}
export async function moderationReview(id: number, signal?: AbortSignal): Promise<ModerationReview> {
  return (await api.get<{ data: ModerationReview }>(`${root}/reviews/${id}`, { signal })).data.data
}
export async function actions(page: number, filters: { target_type?: string; target_id?: string }, signal?: AbortSignal): Promise<Page<Action>> {
  return (await api.get<Page<Action>>(`${root}/actions`, { params: { page, per_page: 20, ...filters }, signal })).data
}
export type ModerationChange =
  | { kind: 'resolve'; id: number; movie?: number; values: { action: 'hide' | 'mark_spoiler'; reason?: string } }
  | { kind: 'dismiss'; id: number; values: { reason?: string } }
  | { kind: 'visibility'; id: number; movie: number; values: { visibility: 'visible' | 'hidden'; reason?: string } }
  | { kind: 'spoiler'; id: number; movie: number; values: { moderator_spoiler: boolean; reason?: string } }
export async function changeModeration(change: ModerationChange, isCurrent: () => boolean): Promise<void> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  const path = change.kind === 'resolve' || change.kind === 'dismiss' ? `${root}/reports/${change.id}/${change.kind}` : `${root}/reviews/${change.id}/${change.kind}`
  if (change.kind === 'resolve' || change.kind === 'dismiss') await api.post(path, change.values)
  else await api.put(path, change.values)
}
export function moderationError(error: unknown): string {
  if (!axios.isAxiosError(error)) return errorDetails(error).message
  const status = error.response?.status
  if (status === 401) return 'Your session expired. Sign in again.'
  if (status === 403) return 'Your account cannot perform this action.'
  if (status === 404) return 'This content is no longer available.'
  if (status === 409) return error.response?.data?.message || 'This item changed. Refresh and try again.'
  if (status === 429) return 'Too many requests. Please try again later.'
  return errorDetails(error).message
}
