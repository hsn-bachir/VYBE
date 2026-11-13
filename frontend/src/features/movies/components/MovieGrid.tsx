import type { MovieSummary } from '../types/movie.types'
import { MovieCard } from './MovieCard'

export function MovieGrid({ movies, pendingCount = 0, pendingLabel = 'Loading more movies', showReleaseDate = false }: { movies: MovieSummary[]; pendingCount?: number; pendingLabel?: string; showReleaseDate?: boolean }) {
  return <><ul className="movie-grid">{movies.map(movie => <MovieCard key={movie.tmdb_id} movie={movie} showReleaseDate={showReleaseDate} />)}<MovieSkeletonCards count={pendingCount} /></ul>{pendingCount > 0 && <span className="sr-only" role="status">{pendingLabel}</span>}</>
}
function MovieSkeletonCards({ count }: { count: number }) {
  return Array.from({ length: count }, (_, i) => <li className="movie-skeleton" key={`pending:${i}`} aria-hidden="true"><div className="skeleton-poster skeleton" /><div className="skeleton-title skeleton" /><div className="skeleton-card-meta"><span className="skeleton" /><span className="skeleton" /></div></li>)
}
export function MovieGridSkeleton({ count = 12, label = 'Loading movies' }: { count?: number; label?: string }) {
  return <div role="status" aria-label={label}><span className="sr-only">{label}…</span><ul className="movie-grid"><MovieSkeletonCards count={count} /></ul></div>
}
