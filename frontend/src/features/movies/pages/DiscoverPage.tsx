import { useCallback, useLayoutEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'
import SpotlightCard from '../../../components/react-bits/SpotlightCard'
import { movieError } from '../api/moviesApi'
import { MovieGrid, MovieGridSkeleton } from '../components/MovieGrid'
import { Button } from '../../../components/ui/Button'
import { MovieSearch } from '../components/MovieSearch'
import { MovieState } from '../components/MovieState'
import { normalizeQuery, pageNumber, uniqueMovies, useDiscoverMovies, useSearchFeed } from '../hooks/useMovies'
import { parseDiscovery } from '../lib/discovery'
import { DiscoveryCategories, DiscoveryControls } from '../components/DiscoveryControls'
import { MoviePagination } from '../components/MoviePagination'
import { useInfiniteMovieScroll } from '../hooks/useInfiniteMovieScroll'
import { useReducedMotion } from '../hooks/useMotionPreference'

export function DiscoverPage() {
  const [params, setParams] = useSearchParams()
  const query = normalizeQuery(params.get('query') ?? '')
  const page = pageNumber(params.get('page'))
  const search = useSearchFeed(query, page)
  const sentinel = useInfiniteMovieScroll(search)
  const movies = uniqueMovies(search.data?.pages ?? [])
  const totalResults = search.data?.pages[0]?.meta.total_results
  const { filters, errors } = parseDiscovery(params)
  const picks = useDiscoverMovies(filters, page, !query && errors.length === 0)
  const titles: Record<string, string> = { popular: 'Popular Movies', trending: 'Trending This Week', top_rated: 'The Highest Rated', now_playing: 'Now Playing', upcoming: 'Coming Soon' }
  const results = useRef<HTMLElement>(null)
  const previous = useRef({ query, page })
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    if (previous.current.query === query && previous.current.page !== page) {
      results.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' })
      results.current?.focus({ preventScroll: true })
    }
    previous.current = { query, page }
  }, [query, page, reduced])
  const onSearch = useCallback((value: string) => setParams(value ? { query: value } : {}), [setParams])
  return <div className="discover-page">
    <section className="discover-intro" aria-labelledby="discover-title">
      <AnimatedContent className="discover-copy"><p className="eyebrow">Explore the unexpected</p><h1 id="discover-title">Find your next<br /><span>obsession.</span></h1><p>Every great movie starts with curiosity.</p></AnimatedContent>
      <SpotlightCard className="discover-search-panel" spotlightColor="var(--color-primary)" style={{ '--spotlight-card-surface': 'var(--color-surface)', '--spotlight-card-border': 'var(--color-border)', '--spotlight-card-shadow': 'none' } as React.CSSProperties}>
        <div className="search-panel-caption"><span>THE NEXT FRAME</span><span>Movie search</span></div>
        <MovieSearch query={query} onSearch={onSearch} busy={search.isFetching} />
        <p id="search-hint" className="search-hint">Search by movie title · Up to 200 characters</p>
      </SpotlightCard>
    </section>
    {query ? <p className="discovery-mode-note">Title search · Browse filters do not apply to search results. <Link className="text-link" to="/discover">Browse movies instead ↗</Link></p> : <DiscoveryCategories filters={filters} />}
    <section ref={results} tabIndex={-1} className="movie-section search-results discover-results" aria-label="Movie search results">
      <AnimatedContent className="section-heading discover-results-heading" distance={14}>
        <div><h2 id="results-heading">{query ? <>Results for “{query}”</> : titles[filters.category ?? 'popular']}</h2>{!query && <p className="discovery-caption">{filters.category === 'trending' ? 'A filtered view of up to 60 weekly trending films.' : filters.category === 'upcoming' ? 'Future releases worth looking forward to.' : filters.category === 'now_playing' ? 'Recent primary releases; local showtimes may differ.' : ''}</p>}</div>
        {(query ? totalResults : picks.data?.meta.total_results) !== undefined && <p className="text-muted" role="status">{(query ? totalResults : picks.data?.meta.total_results)?.toLocaleString()} {filters.category === 'trending' && !query ? 'in this selection' : 'films found'}</p>}
      </AnimatedContent>
      {!query && <DiscoveryControls filters={filters} params={params} onChange={setParams} />}
      {!query ? errors.length > 0 || page === null ? <MovieState title="Let’s adjust the filters.">{errors.join(' ') || 'Use a page from 1 to 500.'} <Link className="text-link" to="/discover">Reset discovery</Link></MovieState>
        : picks.isPending ? <MovieGridSkeleton /> : picks.isError && !picks.data ? <MovieState title="A brief intermission." retry={() => void picks.refetch()}>{movieError(picks.error)}</MovieState>
        : <>{picks.isError && <p className="freshness-note" role="status">Showing the last available results. <button onClick={() => void picks.refetch()}>Refresh</button></p>}{picks.data?.data.length ? <MovieGrid movies={picks.data.data} showReleaseDate={filters.category === 'upcoming'} /> : <MovieState title="Nothing in this edition yet.">Try fewer filters or a different category.</MovieState>}{picks.data && <MoviePagination page={page} totalPages={picks.data.meta.total_pages} />}</>
        : page === null || query.length > 200 ? <MovieState title="Let’s adjust the search.">Use a query up to 200 characters and a page from 1 to 500.</MovieState>
        : search.isPending ? <MovieGridSkeleton />
        : search.isError && !search.data ? <MovieState title="The search needs another take." retry={() => void search.refetch()}>{movieError(search.error)}</MovieState>
        : search.data && <>
          {search.isError && !search.isFetchNextPageError && <p role="status" className="freshness-note">Showing the last available results. <button onClick={() => void search.refetch()}>Refresh</button></p>}
          {movies.length ? <MovieGrid movies={movies} pendingCount={search.isFetchingNextPage ? Math.min(20, Math.max(1, (totalResults ?? movies.length + 20) - movies.length)) : 0} pendingLabel="Loading more search results" /> : <MovieState title="No matches. More possibilities.">We couldn’t find “{query}”. Try another title or check the spelling.</MovieState>}
          {page > 1 && <Link className="text-link" to={`/discover?query=${encodeURIComponent(query)}`}>Start at the first page</Link>}
          <div className="load-more-area" ref={sentinel}>
            <p role="status" aria-live="polite">{search.isFetchNextPageError ? 'More results could not load. Your current movies are still here.' : search.isFetchingNextPage ? 'Finding more films…' : `${movies.length} films in view`}</p>
            {search.hasNextPage && <Button className={search.isFetchNextPageError ? 'load-more-button' : 'load-more-fallback'} disabled={search.isFetching} onClick={() => { if (!search.isFetching) void search.fetchNextPage() }}>{search.isFetchNextPageError ? 'Try loading more' : 'Load more movies manually'}</Button>}
            {!search.hasNextPage && movies.length > 0 && <span className="end-of-reel">You’re all caught up.</span>}
          </div>
        </>}
    </section>
  </div>
}

