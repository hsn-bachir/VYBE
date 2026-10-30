import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { movieError } from '../api/moviesApi'
import { MovieGrid, MovieGridSkeleton } from '../components/MovieGrid'
import { MovieState } from '../components/MovieState'
import { BrandHero } from '../components/BrandHero'
import { Spotlight } from '../components/Spotlight'
import { selectSpotlightMovies } from '../lib/spotlight'
import { uniqueMovies, usePopularFeed } from '../hooks/useMovies'
import { Button } from '../../../components/ui/Button'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'

export function PopularMoviesPage() {
  const result = usePopularFeed()
  const anchor = useRef<number | null>(null)
  const pages = result.data?.pages ?? []
  const movies = uniqueMovies(pages)
  const firstPage = pages[0]?.data
  const featured = useMemo(() => selectSpotlightMovies(firstPage ?? []), [firstPage])
  useEffect(() => {
    if (!result.isFetchingNextPage) return
    const track = () => { if (anchor.current !== null) anchor.current = window.scrollY }
    window.addEventListener('scroll', track, { passive: true })
    return () => window.removeEventListener('scroll', track)
  }, [result.isFetchingNextPage])
  useLayoutEffect(() => {
    if (anchor.current !== null) { window.scrollTo({ top: anchor.current, behavior: 'instant' }); anchor.current = null }
  }, [pages.length])
  return <>
    <BrandHero />
    {featured.length > 0 && <Spotlight movies={featured} />}
    <section className="movie-section popular-section" aria-labelledby="popular-heading"><AnimatedContent className="section-heading"><div><p className="eyebrow">The collective pulse</p><h2 id="popular-heading">Popular right now<span className="accent-period">.</span></h2></div><Link className="text-link" to="/discover">Find your film <span aria-hidden="true">↗</span></Link></AnimatedContent>
      {result.isPending ? <MovieGridSkeleton /> : result.isError && !result.data ? <MovieState title="A brief intermission." retry={() => void result.refetch()}>{movieError(result.error)}</MovieState> : result.data && <>
        {result.isError && !result.isFetchNextPageError && <p role="status" className="freshness-note">Showing the last available results. <button onClick={() => void result.refetch()}>Refresh</button></p>}
        {movies.length ? <MovieGrid movies={movies} /> : <MovieState title="Nothing in this frame yet.">Explore a movie by title, or try again soon.</MovieState>}
        <div className="load-more-area">
          <p role="status" aria-live="polite">{result.isFetchNextPageError ? 'The next scene couldn’t load. Your movies are still here.' : result.isFetchingNextPage ? 'Bringing more stories into view…' : `${movies.length} films in view`}</p>
          {result.hasNextPage && <Button className="load-more-button" disabled={result.isFetching} onClick={() => { if (!result.isFetchingNextPage && !result.isFetching) { anchor.current = window.scrollY; void result.fetchNextPage() } }}>{result.isFetchingNextPage ? 'Loading…' : result.isFetchNextPageError ? 'Try loading more' : 'Load more movies'}<span aria-hidden="true">↓</span></Button>}
          {!result.hasNextPage && movies.length > 0 && <span className="end-of-reel">You’re all caught up.</span>}
        </div>
      </>}
    </section>
  </>
}
