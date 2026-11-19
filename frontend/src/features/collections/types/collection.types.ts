export interface Collection {
  id: number
  name: string
  description: string | null
  movie_count: number
  system_key?: 'favorites' | null
  preview_movies?: { tmdb_id: number; title: string | null; poster_path: string | null }[]
  created_at: string | null
  updated_at: string | null
  contains_movie?: boolean
}
export interface CollectionValues { name: string; description: string | null }
export interface CollectionsResponse {
  data: Collection[]
  meta: { page: number; per_page: number; total_pages: number; total_results: number; preview_metadata_unavailable?: boolean }
}
export type CollectionOperation =
  | { action: 'create'; values: CollectionValues }
  | { action: 'edit'; id: number; values: CollectionValues }
  | { action: 'delete'; id: number }
  | { action: 'membership'; id: number; tmdbId: number; add: boolean }
