import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { movieDetails, movieError, popularMovies, searchMovies } from '../api/moviesApi'
import { movieImageUrl, releaseYear } from '../api/images'
import { MovieCard } from '../components/MovieCard'
import { MovieGridSkeleton } from '../components/MovieGrid'
import { MovieImage } from '../components/MovieImage'
import { MoviePagination } from '../components/MoviePagination'
import { MovieSearch, SEARCH_DEBOUNCE_MS } from '../components/MovieSearch'
import { detailOptions, normalizeQuery, pageNumber, popularOptions, popularFeedOptions, searchOptions, uniqueMovies, validMovieId } from '../hooks/useMovies'
import { PopularMoviesPage } from '../pages/PopularMoviesPage'
import { DiscoverPage } from '../pages/DiscoverPage'
import { MovieDetailsPage } from '../pages/MovieDetailsPage'
import type { MovieDetails, MovieListResponse, MovieSummary } from '../types/movie.types'
import App from '../../../App'
import { selectSpotlightMovies, SPOTLIGHT_INTERVAL } from '../lib/spotlight'
import { BrandHero } from '../components/BrandHero'
import { Spotlight } from '../components/Spotlight'

const summary: MovieSummary = { tmdb_id: 42, title: 'Test film', overview: 'A synthetic test overview.', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', release_date: '2020-01-02', tmdb_rating: 8.4, tmdb_vote_count: 100 }
const movie: MovieDetails = { ...summary, original_title: 'Original test film', runtime: 120, original_language: 'en', genres: [{ id: 18, name: 'Drama' }] }
const list: MovieListResponse = { data: [summary], meta: { page: 1, total_pages: 3, total_results: 41 } }
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
const render = (element: React.ReactNode, queryClient = client(), url = '/') => renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[url]}>{element}</MemoryRouter></QueryClientProvider>)
const failure = (status: number) => ({ isAxiosError: true, response: { status, data: { message: 'internal secret' } } })

beforeEach(() => { vi.restoreAllMocks() })

describe('Core movie API and server state', () => {
  it('calls only public Core paths and forwards cancellation and query parameters', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list })
    const signal = new AbortController().signal
    expect(await popularMovies(2, signal)).toEqual(list)
    expect(get).toHaveBeenLastCalledWith('/api/v1/movies/popular', { params: { page: 2 }, signal })
    await searchMovies('a & b', 3, signal)
    expect(get).toHaveBeenLastCalledWith('/api/v1/movies/search', { params: { query: 'a & b', page: 3 }, signal })
    await movieDetails('42', signal)
    expect(get).toHaveBeenLastCalledWith('/api/v1/movies/42', { signal })
  })
  it('reuses fresh query data and separates query and page keys', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list })
    const cache = client()
    await cache.fetchQuery(popularOptions(1))
    await cache.fetchQuery(popularOptions(1))
    expect(get).toHaveBeenCalledTimes(1)
    await cache.fetchQuery(searchOptions(' first  title ', 1))
    await cache.fetchQuery(searchOptions('first title', 1))
    await cache.fetchQuery(searchOptions('first title', 2))
    await cache.fetchQuery(searchOptions('second title', 1))
    expect(get).toHaveBeenCalledTimes(4)
    cache.clear()
  })
  it('does not enable an empty/oversized search or malformed detail ID', () => {
    expect(searchOptions('  ', 1).enabled).toBe(false)
    expect(searchOptions('a'.repeat(201), 1).enabled).toBe(false)
    expect(detailOptions('abc').enabled).toBe(false)
    expect(SEARCH_DEBOUNCE_MS).toBe(350)
    expect(normalizeQuery('  a  title\n ')).toBe('a title')
  })
  it.each(['0', '-1', '1.5', 'abc', '501'])('rejects invalid URL page %s', value => expect(pageNumber(value)).toBeNull())
  it('accepts provider boundaries and canonical movie IDs', () => {
    expect(pageNumber(null)).toBe(1)
    expect(pageNumber('500')).toBe(500)
    expect(validMovieId('2147483647')).toBe(true)
    expect(validMovieId('2147483648')).toBe(false)
    expect(validMovieId('01')).toBe(false)
  })
  it('never renders raw upstream error messages', () => {
    expect(movieError(failure(404))).toContain('could not be found')
    expect(movieError(failure(422))).toContain('Check your search')
    expect(movieError(failure(503))).not.toContain('internal secret')
  })
})

describe('movie presentation and navigation', () => {
  it('renders a card with an accessible detail link, rating, year and lazy image', () => {
    const html = render(<MovieCard movie={summary} />)
    expect(html).toContain('href="/movies/42"')
    expect(html).toContain('aria-label="View Test film"')
    expect(html).toContain('2020')
    expect(html).toContain('8.4')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('/w342/poster.jpg')
  })
  it('centralizes safe image sizing and rejects external/path traversal URLs', () => {
    expect(movieImageUrl('/poster.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(movieImageUrl(null)).toBeUndefined()
    expect(movieImageUrl('https://evil.test/image.jpg')).toBeUndefined()
    expect(movieImageUrl('/../image.jpg')).toBeUndefined()
    expect(releaseYear(null)).toBeNull()
  })
  it('renders a stable fallback for missing posters and omits missing decorative backdrops', () => {
    expect(render(<MovieImage path={null} title="Test film" />)).toContain('Poster unavailable for Test film')
    expect(render(<MovieImage path={null} title="Test film" variant="backdrop" />)).toBe('')
  })
  it('keeps skeleton dimensions and loading announcements separate from decorative content', () => {
    const html = render(<MovieGridSkeleton />)
    expect(html).toContain('aria-label="Loading movies"')
    expect(html).toContain('aria-hidden="true"')
    expect(html.match(/skeleton-poster/g)).toHaveLength(12)
  })
  it('preserves the query across search pagination', () => {
    const html = render(<MoviePagination page={2} totalPages={3} />, client(), '/discover?query=two+words&page=2')
    expect(html).toContain('/discover?query=two+words&amp;page=3')
    expect(html).toContain('/discover?query=two+words"')
    expect(html).toContain('Movie pages')
  })
  it('renders a labelled search with clear action and current URL value', () => {
    const html = render(<MovieSearch query="Test film" onSearch={() => {}} busy />)
    expect(html).toContain('for="movie-query"')
    expect(html).toContain('value="Test film"')
    expect(html).toContain('Clear search')
    expect(html).toContain('Searching…')
  })
  it('renders real response values in the popular hero and grid', () => {
    const cache = client()
    cache.setQueryData(['movies', 'popular', 1], list)
    const html = render(<PopularMoviesPage />, cache)
    expect(html).toContain('In the Spotlight')
    expect(html).toContain('Test film')
    expect(html).toContain('A synthetic test overview.')
    expect(html).toContain('Popular right now')
    expect(html).not.toContain('coming in Milestone')
  })
  it('provides loading and empty popular states without fabricated movies', () => {
    expect(render(<PopularMoviesPage />)).toContain('Loading movies')
    const cache = client()
    cache.setQueryData(['movies', 'popular', 1], { ...list, data: [] })
    expect(render(<PopularMoviesPage />, cache)).toContain('Nothing in this frame yet.')
  })
  it('renders an empty query and no-results search state', () => {
    expect(render(<DiscoverPage />)).toContain('Movies worth discovering.')
    const cache = client()
    cache.setQueryData(['movies', 'search', 'unmatched', 1], { data: [], meta: { page: 1, total_pages: 0, total_results: 0 } })
    expect(render(<DiscoverPage />, cache, '/discover?query=unmatched')).toContain('No matches. More possibilities.')
  })
  it('renders safe error feedback with a real retry action', async () => {
    const cache = client()
    cache.setQueryDefaults(['movies'], { retryOnMount: false })
    vi.spyOn(api, 'get').mockRejectedValue(failure(503))
    await cache.fetchInfiniteQuery(popularFeedOptions()).catch(() => {})
    const html = render(<PopularMoviesPage />, cache)
    expect(html).toContain('A brief intermission.')
    expect(html).toContain('Try again')
    expect(html).not.toContain('internal secret')
  })
  it('renders full detail, genres and the preserved stale indicator', () => {
    const cache = client()
    cache.setQueryData(['movies', 'detail', '42'], { data: movie, meta: { stale: true } })
    const html = render(<Routes><Route path="/movies/:tmdbId" element={<MovieDetailsPage />} /></Routes>, cache, '/movies/42')
    for (const text of ['Test film', 'Original test film', '120 minutes', 'Drama', '2020-01-02', 'A saved edition.']) expect(html).toContain(text)
  })
  it('handles missing detail metadata and invalid identifiers gracefully', () => {
    const cache = client()
    cache.setQueryData(['movies', 'detail', '42'], { data: { ...movie, overview: null, release_date: null, runtime: null, original_language: null, genres: [] }, meta: { stale: false } })
    const route = <Routes><Route path="/movies/:tmdbId" element={<MovieDetailsPage />} /></Routes>
    expect(render(route, cache, '/movies/42')).toContain('An overview isn’t available')
    expect(render(route, cache, '/movies/42')).toContain('Not available')
    expect(render(route, cache, '/movies/bad')).toContain('This film is out of frame.')
  })
  it('opens movie routes to guests and retains the approved logo, favicon and credits', () => {
    const cache = client()
    cache.setQueryData(['auth', 'me'], null)
    cache.setQueryData(['movies', 'popular', 1], list)
    const html = render(<App />, cache)
    expect(html).toContain('Popular right now')
    expect(html).toContain('logo.svg')
    expect(html).toContain('symbol.svg')
    expect(html).toContain('About &amp; credits')
    expect(html).toContain('not endorsed or certified by TMDB')
    expect(html).toContain('Sign in')
  })
})

describe('homepage refinement', () => {
  it('mounts official React Bits adaptations and reuses cached popular picks on Discover', () => {
    const cache = client()
    const rows = Array.from({ length: 8 }, (_, i) => ({ ...summary, tmdb_id: i + 1, title: `Popular pick ${i + 1}` }))
    cache.setQueryData(popularFeedOptions().queryKey, { pages: [{ ...list, data: rows }], pageParams: [1] })
    const html = render(<DiscoverPage />, cache, '/discover')
    expect(html).toContain('data-react-bits="animated-content"')
    expect(html).toContain('data-react-bits="spotlight-card"')
    expect(html.match(/class="movie-card"/g)).toHaveLength(6)
    expect(html).toContain('Popular pick 6')
    expect(html).not.toContain('Popular pick 7')
  })
  it('prioritizes search results over discovery picks without changing the provider order', () => {
    const cache = client()
    cache.setQueryData(popularOptions(1).queryKey, list)
    cache.setQueryData(searchOptions('space', 1).queryKey, { ...list, data: [{ ...summary, title: 'Search only' }] })
    const html = render(<DiscoverPage />, cache, '/discover?query=space')
    expect(html).toContain('Search only')
    expect(html).not.toContain('Movies worth discovering.')
    expect(html.match(/class="movie-card"/g)).toHaveLength(1)
  })
  it('keeps the supplied artwork separate from functional hero HTML', () => {
    const html = render(<BrandHero />)
    expect(html).toContain('hero.webp')
    expect(html).toContain('Movies hit different')
    expect(html).toContain('Search movie titles')
    expect(html).toContain('type="submit"')
    expect(html).not.toContain('desigeredHomapage')
  })
  it('deduplicates appended pages while preserving provider ordering', () => {
    const movies = uniqueMovies([list, { ...list, data: [summary, { ...summary, tmdb_id: 9 }] }])
    expect(movies.map(movie => movie.tmdb_id)).toEqual([42, 9])
  })
  it('bounds popular pagination and stops on empty or final pages', () => {
    const next = popularFeedOptions().getNextPageParam!
    expect(next(list, [list], 1, [1])).toBe(2)
    expect(next({ ...list, meta: { ...list.meta, page: 3 } }, [], 3, [])).toBeUndefined()
    expect(next({ ...list, data: [] }, [], 1, [])).toBeUndefined()
    expect(next({ ...list, meta: { ...list.meta, page: 500, total_pages: 700 } }, [], 500, [])).toBeUndefined()
  })
  it('prefers usable Spotlight metadata, avoids duplicates and selects at most five', () => {
    const selected = selectSpotlightMovies([{ ...summary, tmdb_id: 1, overview: null }, { ...summary, tmdb_id: 2, backdrop_path: null }, ...Array.from({ length: 8 }, (_, i) => ({ ...summary, tmdb_id: i + 10 }))])
    expect(selected.map(movie => movie.tmdb_id)).toEqual([10, 11, 12, 13, 14])
    expect(selectSpotlightMovies([summary, summary])).toHaveLength(1)
    expect(SPOTLIGHT_INTERVAL).toBe(10000)
  })
  it('renders a single slide without automatic playback controls and with a real details link', () => {
    const html = render(<Spotlight movies={[summary]} />)
    expect(html).toContain('aria-roledescription="carousel"')
    expect(html).toContain('href="/movies/42"')
    expect(html).not.toContain('Next spotlight movie')
    expect(html).not.toContain('spotlight-progress')
  })
  it('reuses infinite pages from the query cache without refetching them on mount', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list })
    const cache = client()
    await cache.fetchInfiniteQuery(popularFeedOptions())
    const html = render(<PopularMoviesPage />, cache)
    expect(html).toContain('Load more movies')
    expect(html).not.toContain('Next page')
    expect(get).toHaveBeenCalledTimes(1)
    expect(popularFeedOptions().refetchOnMount).toBe(false)
    cache.clear()
  })
})
