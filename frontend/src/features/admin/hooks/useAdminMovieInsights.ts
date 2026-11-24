import { useQuery } from '@tanstack/react-query'
import { adminMovieInsights } from '../api/adminMovieInsightsApi'
import { adminKeys, useAdminAccessError } from './useAdminUsers'

export const movieInsightsKey = (owner: number) => [...adminKeys.root(owner), 'movie-insights'] as const

export function useAdminMovieInsights(owner: number) {
  const query = useQuery({
    queryKey: movieInsightsKey(owner),
    queryFn: ({ signal }) => adminMovieInsights(signal),
    enabled: owner > 0,
    retry: false,
  })
  useAdminAccessError(query.error, owner)
  return query
}
