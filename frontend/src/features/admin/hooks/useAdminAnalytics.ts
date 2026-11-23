import { useQuery } from '@tanstack/react-query'
import { adminActivityAnalytics, adminGenreInsights, type ActivityRange } from '../api/adminAnalyticsApi'
import { adminKeys, useAdminAccessError } from './useAdminUsers'

export const genreInsightsKey = (owner: number) => [...adminKeys.root(owner), 'genre-insights'] as const
export const activityAnalyticsKey = (owner: number, range: ActivityRange) => [...adminKeys.root(owner), 'activity-analytics', range] as const

export function useAdminGenreInsights(owner: number) {
  const query = useQuery({
    queryKey: genreInsightsKey(owner),
    queryFn: ({ signal }) => adminGenreInsights(signal),
    enabled: owner > 0,
    retry: false,
  })
  useAdminAccessError(query.error, owner)
  return query
}

export function useAdminActivityAnalytics(owner: number, range: ActivityRange) {
  const query = useQuery({
    queryKey: activityAnalyticsKey(owner, range),
    queryFn: ({ signal }) => adminActivityAnalytics(range, signal),
    enabled: owner > 0,
    retry: false,
  })
  useAdminAccessError(query.error, owner)
  return query
}
