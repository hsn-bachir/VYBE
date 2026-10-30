export interface MovieSummary {
  tmdb_id: number
  title: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string | null
  release_date: string | null
  tmdb_rating: number | null
  tmdb_vote_count: number | null
}

export interface MovieDetails extends MovieSummary {
  original_title: string | null
  runtime: number | null
  original_language: string | null
  genres: { id: number; name: string }[]
}

export interface MovieListResponse {
  data: MovieSummary[]
  meta: { page: number; total_pages: number; total_results: number }
}
export interface MovieDetailResponse {
  data: MovieDetails
  meta: { stale: boolean }
}
