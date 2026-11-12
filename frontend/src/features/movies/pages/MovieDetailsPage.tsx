import axios from 'axios'
import { lazy, Suspense, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { DeferredSection } from '../../../components/ui/DeferredSection'
import { SectionSkeleton } from '../../../components/ui/SectionSkeleton'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'
import { LibraryActions } from '../../library/components/LibraryActions'
import { movieError } from '../api/moviesApi'
import { releaseYear } from '../api/images'
import { MovieCast } from '../components/MovieCast'
import { MovieImage } from '../components/MovieImage'
import { MovieGrid } from '../components/MovieGrid'
import { MovieDetailsSkeleton } from '../components/MovieDetailsSkeleton'
import { MovieRating } from '../components/MovieRating'
import { MovieState } from '../components/MovieState'
import { useMovieDetails, useMovieExperience, validMovieId } from '../hooks/useMovies'
import { trailerEmbed } from '../lib/trailer'
import type { MovieDetails } from '../types/movie.types'
import '../details.css'
import '../../library/library.css'

const TrailerDialog = lazy(() => import('../components/TrailerDialog'))
const CommunityReviewsSection = lazy(() => import('../../reviews/components/CommunityReviewsSection'))

function CinematicDetails({ movie, stale, back }: { movie: MovieDetails; stale: boolean; back: string }) {
  const experience = useMovieExperience(String(movie.tmdb_id), true)
  const [playing, setPlaying] = useState(false)
  const data = experience.data?.data
  const trailer = data?.trailer && trailerEmbed(data.trailer) ? data.trailer : null
  return <article className="cinematic-detail">
    <Link className="cinematic-back text-link" to={back} state={{ restoreHome: back === '/' }}>← {back.startsWith('/library') ? 'Back to library' : 'Back to discovery'}</Link>
    <section className="cinematic-hero" aria-labelledby="movie-title">
      <div className="cinematic-backdrop" aria-hidden="true"><MovieImage path={movie.backdrop_path} title={movie.title} variant="backdrop" eager /></div>
      <div className="cinematic-hero-content">
        <div className="cinematic-poster"><MovieImage path={movie.poster_path} title={movie.title} variant="poster" eager /></div>
        <div className="cinematic-title"><p className="eyebrow">A closer look</p><h1 id="movie-title">{movie.title}</h1>
          {data?.tagline && <p className="movie-tagline">{data.tagline}</p>}
          <div className="cinematic-meta">{releaseYear(movie.release_date) && <span>{releaseYear(movie.release_date)}</span>}{movie.runtime !== null && <span>{movie.runtime} min</span>}<span className="cinematic-rating"><span>TMDB</span> <MovieRating rating={movie.tmdb_rating} votes={movie.tmdb_vote_count} /></span></div>
          {movie.genres.length > 0 && <ul className="genre-list" aria-label="Genres">{movie.genres.map(genre => <li key={genre.id}>{genre.name}</li>)}</ul>}
          {trailer && <Button className="trailer-cta" onClick={() => setPlaying(true)}><span aria-hidden="true">▶</span> Watch {trailer.type === 'Teaser' ? 'Teaser' : 'Trailer'}</Button>}
          <LibraryActions id={movie.tmdb_id} title={movie.title} />
        </div>
      </div>
    </section>
    {(stale || experience.data?.meta.stale) && <p className="freshness-note" role="status">A saved edition. Some details may be out of date while we reconnect.</p>}
    <AnimatedContent distance={18} duration={0.4} className="film-story">
      <section><p className="eyebrow">Behind the frame</p><h2>The story<span className="accent-period">.</span></h2><p className="film-overview">{movie.overview || 'An overview isn’t available for this movie yet.'}</p>
        {!!data?.directors.length && <p className="film-director"><span>Directed by</span>{data.directors.map(person => person.name).join(', ')}</p>}
      </section>
      <aside aria-label="Movie facts"><dl className="film-facts">
        <div><dt>Release date</dt><dd>{movie.release_date ?? 'Not available'}</dd></div>
        <div><dt>Runtime</dt><dd>{movie.runtime === null ? 'Not available' : `${movie.runtime} minutes`}</dd></div>
        <div><dt>Original language</dt><dd>{movie.original_language?.toUpperCase() || 'Not available'}</dd></div>
        <div><dt>TMDB votes</dt><dd>{movie.tmdb_vote_count?.toLocaleString() ?? 'Not available'}</dd></div>
        {movie.original_title && movie.original_title !== movie.title && <div className="film-original"><dt>Original title</dt><dd>{movie.original_title}</dd></div>}
      </dl></aside>
    </AnimatedContent>
    <section className="film-media" aria-labelledby="trailer-heading">
      <div className="section-heading"><div><p className="eyebrow">A glimpse of the world</p><h2 id="trailer-heading">Before the lights go down<span className="accent-period">.</span></h2></div></div>
      {experience.isPending ? <div className="trailer-preview trailer-skeleton skeleton" role="status" aria-label="Loading trailer"><div className="trailer-preview-copy" aria-hidden="true"><div className="trailer-skeleton-line short" /><div className="trailer-skeleton-line" /><div className="trailer-skeleton-button" /></div></div>
        : experience.isError ? <div className="trailer-placeholder"><p>Trailers and credits are temporarily unavailable.</p><Button onClick={() => void experience.refetch()} disabled={experience.isFetching}>Retry movie extras</Button></div>
          : trailer ? <div className="trailer-preview"><div className="trailer-still" aria-hidden="true"><MovieImage path={movie.backdrop_path ?? movie.poster_path} title={movie.title} variant="backdrop" /></div><div className="trailer-preview-copy"><p className="eyebrow">{trailer.official ? 'Official ' : ''}{trailer.type} · YouTube</p><h3>{trailer.name}</h3><Button className="trailer-cta" onClick={() => setPlaying(true)} aria-label={`Play ${movie.title} ${trailer.type.toLowerCase()}`}><span aria-hidden="true">▶</span> Play {trailer.type.toLowerCase()}</Button><p>YouTube loads only when you press play.</p></div></div>
            : <div className="trailer-placeholder"><span className="eyebrow">Off screen, for now</span><p>No trailer is available for this movie.</p></div>}
    </section>
    {experience.isPending ? <div className="cast-skeleton" role="status" aria-label="Loading cast"><div className="detail-skeleton-heading skeleton" /><div className="cast-strip" aria-hidden="true">{[0, 1, 2, 3].map(i => <div className="cast-skeleton-card skeleton" key={i} />)}</div></div> : data && <MovieCast cast={data.cast} />}
    <DeferredSection fallback={<SectionSkeleton label="Community opinions" />}><Suspense fallback={<SectionSkeleton label="Loading community opinions" />}><CommunityReviewsSection movie={movie.tmdb_id} title={movie.title} /></Suspense></DeferredSection>
    {!!data?.related.length && <section className="film-related" aria-labelledby="related-heading"><div className="section-heading"><div><p className="eyebrow">Keep the story going</p><h2 id="related-heading">More to discover<span className="accent-period">.</span></h2></div></div><p className="related-credit">Related films from TMDB</p><MovieGrid movies={data.related} /></section>}
    {playing && trailer && <Suspense fallback={<p role="status">Opening trailer…</p>}><TrailerDialog trailer={trailer} title={movie.title} onClose={() => setPlaying(false)} /></Suspense>}
  </article>
}

export function MovieDetailsPage() {
  const { tmdbId = '' } = useParams()
  const location = useLocation()
  const result = useMovieDetails(tmdbId)
  const from: unknown = location.state?.from
  const back = typeof from === 'string' && /^\/(?:discover(?:\?|$)|library\/(?:watchlist|watched)(?:\?|$)|\?|$)/.test(from) ? from : '/discover'
  if (!validMovieId(tmdbId)) return <MovieState title="This film is out of frame."><Link to="/discover">Back to discovery</Link></MovieState>
  if (result.isPending) return <MovieDetailsSkeleton />
  if (result.isError && !result.data) {
    const missing = axios.isAxiosError(result.error) && result.error.response?.status === 404
    return <MovieState title={missing ? 'This film is out of frame.' : 'A brief intermission.'} retry={missing ? undefined : () => void result.refetch()}>{movieError(result.error)} <Link to={back}>Back to discovery</Link></MovieState>
  }
  if (!result.data) return null
  return <CinematicDetails key={tmdbId} movie={result.data.data} stale={result.data.meta.stale || result.isError} back={back} />
}
