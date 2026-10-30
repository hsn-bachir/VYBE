import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { movieDetails, popularMovies, searchMovies } from '../api/moviesApi'
import type { MovieListResponse, MovieSummary } from '../types/movie.types'

export const normalizeQuery = (query: string) => query.trim().replace(/\s+/gu, ' ')
export const validMovieId = (id: string) => /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647
export const pageNumber = (value: string | null) => value === null ? 1 : (/^[1-9]\d*$/.test(value) && Number(value) <= 500 ? Number(value) : null)
const movieQuery = { staleTime: 60_000, retry: false, refetchOnWindowFocus: false } as const
export const popularOptions = (page: number) => queryOptions({
  ...movieQuery, queryKey: ['movies', 'popular', page], queryFn: ({ signal }) => popularMovies(page, signal),
})
export const searchOptions = (query: string, page: number) => queryOptions({
  ...movieQuery, queryKey: ['movies', 'search', normalizeQuery(query), page],
  queryFn: ({ signal }) => searchMovies(normalizeQuery(query), page, signal),
  enabled: normalizeQuery(query).length > 0 && normalizeQuery(query).length <= 200,
})
export const detailOptions = (id: string) => queryOptions({
  ...movieQuery, queryKey: ['movies', 'detail', id], queryFn: ({ signal }) => movieDetails(id, signal), enabled: validMovieId(id),
})
export const usePopularMovies = (page: number | null) => useQuery({ ...popularOptions(page ?? 1), enabled: page !== null })
export const useMovieSearch = (query: string, page: number | null) => useQuery({ ...searchOptions(query, page ?? 1), enabled: page !== null && searchOptions(query, page ?? 1).enabled })
export const useMovieDetails = (id: string) => useQuery(detailOptions(id))

export const popularFeedOptions = () => infiniteQueryOptions({
  ...movieQuery, queryKey: ['movies', 'popular-feed'], initialPageParam: 1,
  gcTime: 10 * 60_000, refetchOnMount: false,
  queryFn: ({ pageParam, signal }) => popularMovies(pageParam, signal),
  getNextPageParam: (last: MovieListResponse) => last.data.length && last.meta.page < Math.min(500, last.meta.total_pages) ? last.meta.page + 1 : undefined,
})
export function uniqueMovies(pages: MovieListResponse[]): MovieSummary[] {
  const seen = new Set<number>()
  return pages.flatMap(page => page.data).filter(movie => !seen.has(movie.tmdb_id) && !!seen.add(movie.tmdb_id))
}
export function usePopularFeed() {
  const client = useQueryClient()
  return useInfiniteQuery({ ...popularFeedOptions(), initialData: () => {
    const first = client.getQueryData(popularOptions(1).queryKey)
    return first ? { pages: [first], pageParams: [1] } : undefined
  }, initialDataUpdatedAt: () => client.getQueryState(popularOptions(1).queryKey)?.dataUpdatedAt })
}

export function useDiscoveryPicks(enabled: boolean) {
  const client = useQueryClient()
  return useQuery({ ...popularOptions(1), enabled, refetchOnMount: false,
    initialData: () => client.getQueryData(popularFeedOptions().queryKey)?.pages[0],
    initialDataUpdatedAt: () => client.getQueryState(popularFeedOptions().queryKey)?.dataUpdatedAt,
  })
}
