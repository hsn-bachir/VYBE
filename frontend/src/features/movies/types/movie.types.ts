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

export interface MovieTrailer { name: string; key: string; site: 'YouTube'; type: 'Trailer' | 'Teaser'; official: boolean }
export interface MovieExperienceResponse {
  data: {
    tmdb_id: number; tagline: string | null; trailer: MovieTrailer | null
    directors: { tmdb_id: number; name: string }[]
    cast: { tmdb_id: number; name: string; character: string | null; profile_path: string | null }[]
    related: MovieSummary[]
  }
  meta: { stale: boolean }
}
