import axios from 'axios'
import { Link, useLocation, useParams } from 'react-router-dom'
import { VybeLoader } from '../../../components/branding/VybeLoader'
import { movieError } from '../api/moviesApi'
import { MovieImage } from '../components/MovieImage'
import { MovieRating } from '../components/MovieRating'
import { MovieState } from '../components/MovieState'
import { useMovieDetails, validMovieId } from '../hooks/useMovies'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'

export function MovieDetailsPage() {
  const { tmdbId = '' } = useParams()
  const location = useLocation()
  const result = useMovieDetails(tmdbId)
  const from: unknown = location.state?.from
  const back = typeof from === 'string' && /^\/(?:discover(?:\?|$)|\?|$)/.test(from) ? from : '/discover'
  if (!validMovieId(tmdbId)) return <MovieState title="This film is out of frame."><Link to="/discover">Back to discovery</Link></MovieState>
  if (result.isPending) return <div className="detail-loading"><VybeLoader label="Setting the scene…" /><div className="detail-skeleton skeleton" aria-hidden="true" /></div>
  if (result.isError && !result.data) {
    const missing = axios.isAxiosError(result.error) && result.error.response?.status === 404
    return <MovieState title={missing ? 'This film is out of frame.' : 'A brief intermission.'} retry={missing ? undefined : () => void result.refetch()}>{movieError(result.error)} <Link to={back}>Back to discovery</Link></MovieState>
  }
  if (!result.data) return null
  const { data: movie, meta } = result.data
  return <article className="movie-detail"><Link className="detail-back text-link" to={back} state={{ restoreHome: back === '/' }}>← Back to discovery</Link>
    <div className="detail-stage"><div className="detail-art"><MovieImage path={movie.backdrop_path} title={movie.title} variant="backdrop" eager /></div><div className="cinema-shade" /><span className="detail-label eyebrow">A closer look</span></div>
    <div className="detail-body"><div className="detail-poster"><MovieImage path={movie.poster_path} title={movie.title} variant="poster" eager /></div><AnimatedContent className="detail-copy"><p className="eyebrow">The story, in focus</p><h1>{movie.title}</h1>{movie.original_title && movie.original_title !== movie.title && <p className="original-title">Original title: {movie.original_title}</p>}
      <div className="detail-meta"><MovieRating rating={movie.tmdb_rating} votes={movie.tmdb_vote_count} />{movie.runtime !== null && <span>{movie.runtime} min</span>}{movie.release_date && <span>{movie.release_date}</span>}</div>
      {movie.genres.length > 0 && <ul className="genre-list" aria-label="Genres">{movie.genres.map(genre => <li key={genre.id}>{genre.name}</li>)}</ul>}
      <div className="overview"><h2>The story</h2><p>{movie.overview || 'An overview isn’t available for this movie yet.'}</p></div>
      <dl className="movie-facts"><div><dt>Release date</dt><dd>{movie.release_date ?? 'Not available'}</dd></div><div><dt>Runtime</dt><dd>{movie.runtime === null ? 'Not available' : `${movie.runtime} minutes`}</dd></div><div><dt>Original language</dt><dd>{movie.original_language?.toUpperCase() || 'Not available'}</dd></div><div><dt>TMDB votes</dt><dd>{movie.tmdb_vote_count?.toLocaleString() ?? 'Not available'}</dd></div></dl>
      {(meta.stale || result.isError) && <p className="freshness-note" role="status">A saved edition. These details may be a little out of date while we reconnect.</p>}
    </AnimatedContent></div></article>
}
