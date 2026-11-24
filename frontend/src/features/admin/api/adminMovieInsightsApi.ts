import { api } from '../../../lib/api/client'
import type { MovieSummary } from '../../movies/types/movie.types'

type MovieReference = {
  tmdb_id: number
  movie: Pick<MovieSummary, 'title' | 'poster_path' | 'release_date'> | null
}

export type MostWatchedMovie = MovieReference & { watched_users: number }
export type HighestRatedMovie = MovieReference & { rating_count: number; average_rating: number }

export type AdminMovieInsights = {
  data: { most_watched: MostWatchedMovie[]; highest_rated: HighestRatedMovie[] }
  meta: { metadata_unavailable: boolean }
}

export async function adminMovieInsights(signal?: AbortSignal): Promise<AdminMovieInsights> {
  return (await api.get<AdminMovieInsights>('/api/v1/admin/movie-insights', { signal })).data
}
