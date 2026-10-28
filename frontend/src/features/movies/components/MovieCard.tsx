import { Link, useLocation } from 'react-router-dom'
import { releaseYear } from '../api/images'
import type { MovieSummary } from '../types/movie.types'
import { MovieImage } from './MovieImage'
import { MovieRating } from './MovieRating'

export function MovieCard({ movie }: { movie: MovieSummary }) {
  const location = useLocation()
  return <li><Link className="movie-card" to={`/movies/${movie.tmdb_id}`} state={{ from: location.pathname + location.search }} aria-label={`View ${movie.title}`}>
    <div className="movie-poster"><MovieImage path={movie.poster_path} title={movie.title} /><span className="card-reveal" aria-hidden="true">Explore film <span>↗</span></span></div>
    <h3>{movie.title}</h3><div className="card-meta"><span>{releaseYear(movie.release_date) ?? 'Year unavailable'}</span><MovieRating rating={movie.tmdb_rating} votes={movie.tmdb_vote_count} /></div>
  </Link></li>
}
