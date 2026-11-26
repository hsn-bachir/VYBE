import type { PublicProfile } from '../../profile/types/publicProfile.types'
import type { MovieSummary } from '../../movies/types/movie.types'

export interface PublicCollection {
  id: number
  name: string
  description: string | null
  movie_count: number
  creator: PublicProfile
  preview_movies?: { tmdb_id: number; title: string | null; poster_path: string | null }[]
}
export interface PublicCollectionsResponse {
  data: PublicCollection[]
  meta: { page: number; per_page: number; total_pages: number; total_results: number; preview_metadata_unavailable: boolean }
}
export interface PublicCollectionMoviesResponse {
  data: { tmdb_id: number; movie: MovieSummary | null; metadata_status: 'available' | 'missing' | 'unavailable' }[]
  meta: { page: number; per_page: number; total_pages: number; total_results: number; metadata_unavailable: boolean }
}
