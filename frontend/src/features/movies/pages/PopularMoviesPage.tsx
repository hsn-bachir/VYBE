import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { movieError } from '../api/moviesApi'
import { MovieGrid, MovieGridSkeleton } from '../components/MovieGrid'
import { MovieState } from '../components/MovieState'
import { BrandHero } from '../components/BrandHero'
import { Spotlight } from '../components/Spotlight'
import { SpotlightSkeleton } from '../components/SpotlightSkeleton'
import { selectSpotlightMovies } from '../lib/spotlight'
import { uniqueMovies, usePopularFeed } from '../hooks/useMovies'
import { useInfiniteMovieScroll } from '../hooks/useInfiniteMovieScroll'
import { Button } from '../../../components/ui/Button'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'

export function PopularMoviesPage() {
  const result = usePopularFeed()
  const sentinel = useInfiniteMovieScroll(result)
  const pages = result.data?.pages ?? []
  const movies = uniqueMovies(pages)
  const firstPage = pages[0]?.data
  const featured = useMemo(() => selectSpotlightMovies(firstPage ?? []), [firstPage])
  return <>
    <BrandHero />
    {result.isPending ? <SpotlightSkeleton /> : featured.length > 0 && <Spotlight movies={featured} />}
    <section className="movie-section popular-section" aria-labelledby="popular-heading"><AnimatedContent className="section-heading"><div><p className="eyebrow">The collective pulse</p><h2 id="popular-heading">Popular right now<span className="accent-period">.</span></h2></div><Link className="text-link" to="/discover">Find your film <span aria-hidden="true">↗</span></Link></AnimatedContent>
      {result.isPending ? <MovieGridSkeleton /> : result.isError && !result.data ? <MovieState title="A brief intermission." retry={() => void result.refetch()}>{movieError(result.error)}</MovieState> : result.data && <>
        {result.isError && !result.isFetchNextPageError && <p role="status" className="freshness-note">Showing the last available results. <button onClick={() => void result.refetch()}>Refresh</button></p>}
        {movies.length ? <MovieGrid movies={movies} pendingCount={result.isFetchingNextPage ? Math.min(20, Math.max(1, (pages[0]?.meta.total_results ?? movies.length + 20) - movies.length)) : 0} pendingLabel="Loading more popular movies" /> : <MovieState title="Nothing in this frame yet.">Explore a movie by title, or try again soon.</MovieState>}
        <div className="load-more-area" ref={sentinel}>
          <p role="status" aria-live="polite">{result.isFetchNextPageError ? 'The next scene couldn’t load. Your movies are still here.' : result.isFetchingNextPage ? 'Bringing more stories into view…' : `${movies.length} films in view`}</p>
          {result.hasNextPage && <Button className={result.isFetchNextPageError ? 'load-more-button' : 'load-more-fallback'} disabled={result.isFetching} onClick={() => { if (!result.isFetching) void result.fetchNextPage() }}>{result.isFetchingNextPage ? 'Loading…' : result.isFetchNextPageError ? 'Try loading more' : 'Load more movies manually'}<span aria-hidden="true">↓</span></Button>}
          {!result.hasNextPage && movies.length > 0 && <span className="end-of-reel">You’re all caught up.</span>}
        </div>
      </>}
    </section>
  </>
}
