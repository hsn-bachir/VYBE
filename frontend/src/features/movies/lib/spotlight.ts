import { movieImageUrl } from '../api/images'
import type { MovieSummary } from '../types/movie.types'

export const SPOTLIGHT_INTERVAL = 10_000
export function selectSpotlightMovies(movies: MovieSummary[]) {
  const candidates = movies.filter(movie => movieImageUrl(movie.backdrop_path) && movie.title.trim())
  const preferred = candidates.filter(movie => movie.overview?.trim() && movie.tmdb_rating !== null)
  const ids = new Set<number>()
  return [...preferred, ...candidates].filter(movie => !ids.has(movie.tmdb_id) && !!ids.add(movie.tmdb_id)).slice(0, 5)
}
