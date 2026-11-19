import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api/client'
import type { MovieSummary } from '../movies/types/movie.types'

export interface RecommendationFeed {
  data: { sections: { id: string; title: string; explanation: string | null; movies: MovieSummary[] }[] }
  meta: { personalized: boolean; partial: boolean }
}
// Nest under the existing private library owner key so logout/access loss clears it.
export const recommendationKey = (owner: number) => ['library', owner, 'recommendations'] as const
export const recommendationOptions = (owner: number) => queryOptions({
  queryKey: recommendationKey(owner), enabled: owner > 0, staleTime: 30_000, retry: false,
  queryFn: async ({ signal }) => (await api.get<RecommendationFeed>('/api/v1/me/recommendations', { signal, timeout: 30_000 })).data,
})
export async function refreshRecommendations(client: QueryClient, owner: number, exclude?: number) {
  const queryKey = recommendationKey(owner)
  if (!client.getQueryState(queryKey)) return
  await client.cancelQueries({ queryKey })
  if (exclude) client.setQueryData<RecommendationFeed>(queryKey, old => old ? {
    ...old, data: { sections: old.data.sections.map(section => ({ ...section, movies: section.movies.filter(movie => movie.tmdb_id !== exclude) })) },
  } : undefined)
  void client.invalidateQueries({ queryKey })
}
