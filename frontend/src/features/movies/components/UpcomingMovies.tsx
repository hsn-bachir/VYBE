import { Link } from 'react-router-dom'
import { useState } from 'react'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'
import { movieError } from '../api/moviesApi'
import { movieImageUrl } from '../api/images'
import { uniqueMovies, useDiscoverMovies } from '../hooks/useMovies'
import { MovieGrid, MovieGridSkeleton } from './MovieGrid'
import { MovieState } from './MovieState'

export function UpcomingMovies() {
  const result = useDiscoverMovies({ category: 'upcoming' }, 1)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const movies = uniqueMovies(result.data ? [result.data] : []).filter(movie => movieImageUrl(movie.poster_path) && movie.release_date && movie.release_date > today).slice(0, 6)
  return <section className="movie-section upcoming-section" aria-labelledby="upcoming-heading">
    <AnimatedContent className="section-heading"><div><p className="eyebrow">Coming soon</p><h2 id="upcoming-heading">Worth the Wait<span className="accent-period">.</span></h2><p className="upcoming-caption">The next stories to look forward to.</p></div><Link className="text-link" to="/discover?category=upcoming">Explore Upcoming <span aria-hidden="true">↗</span></Link></AnimatedContent>
    {result.isPending ? <MovieGridSkeleton count={6} label="Loading upcoming movies" />
      : result.isError && !result.data ? <MovieState title="The next act is taking a moment." retry={() => void result.refetch()}>{movieError(result.error)}</MovieState>
      : <>{result.isError && <p className="freshness-note" role="status">Showing the last available upcoming films. <button onClick={() => void result.refetch()}>Refresh</button></p>}{movies.length ? <MovieGrid movies={movies} showReleaseDate /> : <MovieState title="The next chapter is on its way.">No upcoming films with posters are available right now. Check back soon.</MovieState>}</>}
  </section>
}
