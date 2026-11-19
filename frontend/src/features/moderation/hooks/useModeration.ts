import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { reviewKeys } from '../../reviews/hooks/useReviews'
import { adminKeys, useAdminAccessError } from '../../admin/hooks/useAdminUsers'
import { actions, changeModeration, moderationReview, movieSummaries, overview, report, reports, reviews, type ModerationChange, type ReportFilters, type ReviewFilters } from '../api/moderationApi'

export const moderationKeys = {
  overview: (owner: number) => ['admin', owner, 'overview'] as const,
  movies: (owner: number, ids: number[]) => ['admin', owner, 'movie-summaries', ids] as const,
  reports: (owner: number, filters: ReportFilters) => ['admin', owner, 'reports', filters] as const,
  report: (owner: number, id: number) => ['admin', owner, 'report', id] as const,
  reviews: (owner: number, filters: ReviewFilters) => ['admin', owner, 'reviews', filters] as const,
  review: (owner: number, id: number) => ['admin', owner, 'review', id] as const,
  actions: (owner: number, page: number, filters: { target_type?: string; target_id?: string } = {}) => ['admin', owner, 'actions', page, filters] as const,
}
export function useModerationReview(owner: number, id: number) {
  const result = useQuery({ queryKey: moderationKeys.review(owner, id), queryFn: ({ signal }) => moderationReview(id, signal), enabled: owner > 0 && id > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useModerationMovieSummaries(owner: number, ids: number[]) {
  const unique = [...new Set(ids)].sort((a, b) => a - b).slice(0, 50)
  return useQuery({ queryKey: moderationKeys.movies(owner, unique), queryFn: ({ signal }) => movieSummaries(unique, signal),
    enabled: owner > 0 && unique.length > 0, retry: false, staleTime: 5 * 60_000 })
}
export function useAdminOverview(owner: number) {
  const result = useQuery({ queryKey: moderationKeys.overview(owner), queryFn: ({ signal }) => overview(signal), enabled: owner > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useReports(owner: number, filters: ReportFilters) {
  const result = useQuery({ queryKey: moderationKeys.reports(owner, filters), queryFn: ({ signal }) => reports(filters, signal), enabled: owner > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useReport(owner: number, id: number) {
  const result = useQuery({ queryKey: moderationKeys.report(owner, id), queryFn: ({ signal }) => report(id, signal), enabled: owner > 0 && id > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useModerationReviews(owner: number, filters: ReviewFilters) {
  const result = useQuery({ queryKey: moderationKeys.reviews(owner, filters), queryFn: ({ signal }) => reviews(filters, signal), enabled: owner > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useModerationActions(owner: number, page: number, filters: { target_type?: string; target_id?: string } = {}) {
  const result = useQuery({ queryKey: moderationKeys.actions(owner, page, filters), queryFn: ({ signal }) => actions(page, filters, signal), enabled: owner > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useModerationChange(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: (change: ModerationChange) => changeModeration(change, current),
    onSuccess: (_, change) => {
      if (!current()) return
      void client.invalidateQueries({ queryKey: adminKeys.root(owner) })
      if (current() && 'movie' in change && change.movie) {
        void client.invalidateQueries({ queryKey: reviewKeys.lists(change.movie) })
        void client.invalidateQueries({ queryKey: reviewKeys.own(owner, change.movie), exact: true })
      }
    },
  })
  useAdminAccessError(result.error, owner)
  return result
}
