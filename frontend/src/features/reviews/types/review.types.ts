export interface Review {
  id: number
  tmdb_id: number
  author: { id: number; username: string; avatar_url: string | null }
  body: string
  contains_spoilers: boolean
  author_contains_spoilers?: boolean
  moderator_spoiler?: boolean
  visibility?: 'visible' | 'hidden'
  created_at: string | null
  updated_at: string | null
}
export interface ReviewValues { body: string; contains_spoilers: boolean }
export type ReviewOperation = { action: 'create'; values: ReviewValues } | { action: 'edit'; id: number; values: Partial<ReviewValues> } | { action: 'delete'; id: number }
export interface ReviewsResponse { data: Review[]; meta: { page: number; per_page: number; total_pages: number; total_results: number } }
