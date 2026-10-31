import type { MovieSummary } from '../../movies/types/movie.types'

export type LibraryKind = 'watchlist' | 'watched'
export interface Membership { tmdb_id: number; created_at: string; watched_at?: string }
export interface LibraryEntry extends Membership { movie: MovieSummary | null; metadata_status: 'available' | 'missing' | 'unavailable' }
export interface LibraryResponse {
  data: LibraryEntry[]
  meta: { page: number; per_page: number; total_pages: number; total_results: number; metadata_unavailable: boolean }
}
export interface LibraryState { tmdb_id: number; in_watchlist: boolean; watched_at: string | null }
