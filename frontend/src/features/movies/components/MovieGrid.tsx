import type { MovieSummary } from '../types/movie.types'
import { MovieCard } from './MovieCard'

export function MovieGrid({ movies }: { movies: MovieSummary[] }) {
  return <ul className="movie-grid">{movies.map(movie => <MovieCard key={movie.tmdb_id} movie={movie} />)}</ul>
}
export function MovieGridSkeleton({ count = 12 }: { count?: number }) {
  return <div role="status" aria-label="Loading movies"><span className="sr-only">Loading movies…</span><div className="movie-grid" aria-hidden="true">{Array.from({ length: count }, (_, i) => <div className="movie-skeleton" key={i}><div className="skeleton-poster skeleton" /><div className="skeleton-title skeleton" /><div className="skeleton-meta skeleton" /></div>)}</div></div>
}
