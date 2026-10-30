import { useCallback, useLayoutEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'
import SpotlightCard from '../../../components/react-bits/SpotlightCard'
import { movieError } from '../api/moviesApi'
import { MovieGrid, MovieGridSkeleton } from '../components/MovieGrid'
import { MoviePagination } from '../components/MoviePagination'
import { MovieSearch } from '../components/MovieSearch'
import { MovieState } from '../components/MovieState'
import { normalizeQuery, pageNumber, useDiscoveryPicks, useMovieSearch } from '../hooks/useMovies'
import { useReducedMotion } from '../hooks/useMotionPreference'

export function DiscoverPage() {
  const [params, setParams] = useSearchParams()
  const query = normalizeQuery(params.get('query') ?? '')
  const page = pageNumber(params.get('page'))
  const search = useMovieSearch(query, page)
  const picks = useDiscoveryPicks(!query)
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
      <AnimatedContent className="discover-copy" trigger="mount" duration={1.2} delay={0.08} distance={12} ease="power1.out" stagger={0.12}><p className="eyebrow">Explore the unexpected</p><h1 id="discover-title">Find your next<br /><span>obsession.</span></h1><p>Every great movie starts with curiosity.</p></AnimatedContent>
      <AnimatedContent className="discover-search-reveal" trigger="mount" duration={1.2} delay={0.44} distance={12} ease="power1.out">
        <SpotlightCard className="discover-search-panel" spotlightColor="var(--color-primary)" style={{ '--spotlight-card-surface': 'var(--color-surface)', '--spotlight-card-border': 'var(--color-border)', '--spotlight-card-shadow': 'none' } as React.CSSProperties}>
          <div className="search-panel-caption"><span>THE NEXT FRAME</span><span>Movie search</span></div>
          <MovieSearch query={query} onSearch={onSearch} busy={search.isFetching} />
          <p id="search-hint" className="search-hint">Search by movie title · Up to 200 characters</p>
        </SpotlightCard>
      </AnimatedContent>
    </section>
    <section ref={results} tabIndex={-1} className="movie-section search-results discover-results" aria-label="Movie search results">
      <AnimatedContent className="section-heading discover-results-heading" distance={14} duration={1.1} delay={0.16} ease="power1.out">
        <div>{!query && <p className="eyebrow">Start exploring</p>}<h2 id="results-heading">{query ? <>Results for “{query}”</> : 'Movies worth discovering.'}</h2>{!query && <p className="discovery-caption">A few films from the current popular lineup.</p>}</div>
        {query ? search.data && <p className="text-muted" role="status">{search.data.meta.total_results.toLocaleString()} {search.data.meta.total_results === 1 ? 'film' : 'films'} found</p> : <Link to="/" className="text-link">Explore the lineup ↗</Link>}
      </AnimatedContent>
      {!query ? picks.isPending ? <MovieGridSkeleton count={6} /> : picks.isError && !picks.data ? <MovieState title="A brief intermission." retry={() => void picks.refetch()}>{movieError(picks.error)}</MovieState> : picks.data?.data.length ? <MovieGrid movies={picks.data.data.slice(0, 6)} /> : <MovieState title="Nothing in this edition yet.">Search for a movie title above.</MovieState>
        : page === null || query.length > 200 ? <MovieState title="Let’s adjust the search.">Use a query up to 200 characters and a page from 1 to 500.</MovieState>
        : search.isPending ? <MovieGridSkeleton />
        : search.isError && !search.data ? <MovieState title="The search needs another take." retry={() => void search.refetch()}>{movieError(search.error)}</MovieState>
        : search.data && <>
          {search.isError && <p role="status" className="freshness-note">Showing the last available results. <button onClick={() => void search.refetch()}>Refresh</button></p>}
          {search.data.data.length ? <MovieGrid movies={search.data.data} /> : <MovieState title="No matches. More possibilities.">We couldn’t find “{query}”. Try another title or check the spelling.</MovieState>}
          <MoviePagination page={page} totalPages={search.data.meta.total_pages} /></>}
    </section>
  </div>
}

