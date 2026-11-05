import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { reviewKeys } from '../../reviews/hooks/useReviews'
import { adminKeys, useAdminAccessError } from '../../admin/hooks/useAdminUsers'
import { actions, changeModeration, report, reports, reviews, type ModerationChange, type ReportFilters, type ReviewFilters } from '../api/moderationApi'

export const moderationKeys = {
  reports: (owner: number, filters: ReportFilters) => ['admin', owner, 'reports', filters] as const,
  report: (owner: number, id: number) => ['admin', owner, 'report', id] as const,
  reviews: (owner: number, filters: ReviewFilters) => ['admin', owner, 'reviews', filters] as const,
  actions: (owner: number, page: number) => ['admin', owner, 'actions', page] as const,
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
export function useModerationActions(owner: number, page: number) {
  const result = useQuery({ queryKey: moderationKeys.actions(owner, page), queryFn: ({ signal }) => actions(page, signal), enabled: owner > 0, retry: false })
  useAdminAccessError(result.error, owner)
  return result
}
export function useModerationChange(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: (change: ModerationChange) => changeModeration(change, current),
    onSuccess: async (_, change) => {
      if (!current()) return
      await client.invalidateQueries({ queryKey: adminKeys.root(owner) })
      if (current() && 'movie' in change && change.movie) {
        await Promise.all([
          client.invalidateQueries({ queryKey: reviewKeys.lists(change.movie) }),
          client.invalidateQueries({ queryKey: reviewKeys.own(owner, change.movie), exact: true }),
        ])
      }
    },
  })
  useAdminAccessError(result.error, owner)
  return result
}
