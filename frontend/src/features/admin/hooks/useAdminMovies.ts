import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { managedMovie, managedMovies, refreshMovie, type MovieFilters } from '../api/adminMoviesApi'
import { useAdminAccessError } from './useAdminUsers'

export const managedMovieKeys = {
  root: (owner: number) => ['admin', owner, 'managed-movies'] as const,
  list: (owner: number, filters: MovieFilters) => ['admin', owner, 'managed-movies', 'list', filters] as const,
  detail: (owner: number, id: number) => ['admin', owner, 'managed-movies', 'detail', id] as const,
}
export function useManagedMovies(owner: number, filters: MovieFilters) {
  const query = useQuery({ queryKey: managedMovieKeys.list(owner, filters), queryFn: ({ signal }) => managedMovies(filters, signal), enabled: owner > 0, retry: false })
  useAdminAccessError(query.error, owner)
  return query
}
export function useManagedMovie(owner: number, id: number) {
  const query = useQuery({ queryKey: managedMovieKeys.detail(owner, id), queryFn: ({ signal }) => managedMovie(id, signal), enabled: owner > 0 && Number.isInteger(id) && id > 0 && id <= 2147483647, retry: false })
  useAdminAccessError(query.error, owner)
  return query
}
export function useRefreshMovie(owner: number, id: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const mutation = useMutation({ mutationKey: [...managedMovieKeys.detail(owner, id), 'refresh'], retry: false,
    mutationFn: () => refreshMovie(id, current), onSuccess: movie => {
      if (!current()) return
      client.setQueryData(managedMovieKeys.detail(owner, id), movie)
      void client.invalidateQueries({ queryKey: managedMovieKeys.root(owner) })
      void client.invalidateQueries({ queryKey: ['admin', owner, 'movie-insights'] })
      void client.invalidateQueries({ queryKey: ['admin', owner, 'genre-insights'] })
    } })
  useAdminAccessError(mutation.error, owner)
  return mutation
}
