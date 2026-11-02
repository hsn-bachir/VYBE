export type StarRating = 1 | 2 | 3 | 4 | 5
export interface PersonalRating { tmdb_id: number; rating: StarRating; updated_at: string }
export interface RatingStatistics {
  tmdb_id: number
  average_rating: number | null
  total_ratings: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
}
export type RatingOperation = { action: 'put'; rating: StarRating } | { action: 'delete' }
