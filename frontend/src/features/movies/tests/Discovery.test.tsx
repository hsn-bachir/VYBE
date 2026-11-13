import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { discoverMovies } from '../api/moviesApi'
import { discoveryOptions, popularFeedOptions, popularOptions, searchFeedOptions } from '../hooks/useMovies'
import { categories, discoveryParams, normalizeDiscovery, parseDiscovery, sorts } from '../lib/discovery'
import { PopularMoviesPage } from '../pages/PopularMoviesPage'
import { DiscoverPage } from '../pages/DiscoverPage'
import { UpcomingMovies } from '../components/UpcomingMovies'
import type { MovieListResponse, MovieSummary } from '../types/movie.types'

const summary: MovieSummary = { tmdb_id: 1, title: 'Upcoming fixture', overview: 'A test fixture', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', release_date: '2099-12-10', tmdb_rating: 8, tmdb_vote_count: 400 }
const list: MovieListResponse = { data: [summary], meta: { page: 1, total_pages: 4, total_results: 80 } }
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } })
const render = (element: React.ReactNode, cache = client(), url = '/') => renderToStaticMarkup(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[url]}>{element}</MemoryRouter></QueryClientProvider>)
beforeEach(() => { vi.restoreAllMocks() })

describe('discovery contract and URL state', () => {
  it('calls Core with validated filters, pagination and request cancellation', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list })
    const filters = normalizeDiscovery({ category: 'upcoming', genres: [35, 18], genre_match: 'all', runtime_min: 90 })
    const signal = new AbortController().signal
    await discoverMovies(filters, 2, signal)
    expect(get).toHaveBeenCalledWith('/api/v1/movies/discover', { params: { ...filters, page: 2 }, signal })
  })
  it('canonicalizes equivalent filters and shares fresh data between Home and Discover', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list })
    const cache = client()
    await cache.fetchQuery(discoveryOptions({ category: 'upcoming' }))
    await cache.fetchQuery(discoveryOptions(parseDiscovery(new URLSearchParams('category=upcoming')).filters))
    expect(get).toHaveBeenCalledTimes(1)
    await cache.fetchQuery(discoveryOptions({ genres: [35, 18, 35], rating_min: 0 }))
    await cache.fetchQuery(discoveryOptions({ category: 'popular', genres: [18, 35], genre_match: 'any', sort: 'popularity.desc' }))
    expect(get).toHaveBeenCalledTimes(2)
    expect(discoveryOptions({}).queryKey).toEqual(popularOptions(1).queryKey)
    expect(discoveryOptions({ category: 'upcoming' }, 2).queryKey).not.toEqual(discoveryOptions({ category: 'upcoming' }, 1).queryKey)
    cache.clear()
  })
  it('cancels obsolete discovery requests through the HTTP AbortSignal', async () => {
    let signal: AbortSignal | undefined
    vi.spyOn(api, 'get').mockImplementation((_url, config) => {
      signal = config?.signal as AbortSignal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
    })
    const cache = client()
    const options = discoveryOptions({ category: 'upcoming' })
    const pending = cache.fetchQuery(options).catch(() => {})
    expect(signal?.aborted).toBe(false)
    await cache.cancelQueries({ queryKey: options.queryKey })
    expect(signal?.aborted).toBe(true)
    await pending
    cache.clear()
  })
  it.each(categories)('round trips the %s category and filters in shareable URLs', (category) => {
    const filters = normalizeDiscovery(category === 'trending' ? { category } : { category, genres: [35, 18], genre_match: 'all', year_from: 2000, year_to: 2099, rating_min: 7.5, runtime_min: 90, runtime_max: 180, original_language: 'fr' })
    const params = discoveryParams(filters, 3)
    expect(parseDiscovery(params)).toEqual({ filters, errors: [] })
    expect(params.get('page')).toBe('3')
  })
  it.each(sorts)('preserves the %s sort in URL and request state', (sort) => {
    expect(parseDiscovery(discoveryParams({ sort })).filters.sort).toBe(sort)
  })
  it('keeps supported Trending filters while showing its limited count and runtime restriction', () => {
    const params = new URLSearchParams('category=trending&genres=18,35&genre_match=all&year_from=2020&rating_min=7&original_language=fr')
    const { filters, errors } = parseDiscovery(params)
    expect(errors).toEqual([])
    expect(filters).toEqual({ category: 'trending', genres: [18, 35], genre_match: 'all', year_from: 2020, rating_min: 7, original_language: 'fr' })
    const cache = client()
    cache.setQueryData(discoveryOptions(filters).queryKey, { ...list, meta: { page: 1, total_pages: 2, total_results: 21 } })
    const html = render(<DiscoverPage />, cache, `/discover?${params}`)
    expect(html).toContain('Trending This Week')
    expect(html).toContain('21 in this selection')
    expect(html).toContain('first 60 films')
    expect(html).not.toContain('Runtime from')
    expect(html).toContain('Remove Drama filter')
    expect(html).toContain('page=2')
  })
  it.each(['category=bad', 'sort=bad', 'genres=18,999', 'genre_match=bad', 'year_from=1887', 'year_to=2101', 'year_from=2030&year_to=2020', 'runtime_min=100&runtime_max=90', 'rating_min=11', 'runtime_max=601', 'original_language=eng', 'category=trending&runtime_min=90'])('rejects invalid browse state: %s', (query) => {
    expect(parseDiscovery(new URLSearchParams(query)).errors.length).toBeGreaterThan(0)
    expect(render(<DiscoverPage />, client(), `/discover?${query}`)).toContain('Let’s adjust the filters.')
  })
  it('renders selected Upcoming category, release dates and filter-preserving page links', () => {
    const cache = client()
    const filters = parseDiscovery(new URLSearchParams('category=upcoming&genres=18&genre_match=all')).filters
    cache.setQueryData(discoveryOptions(filters, 2).queryKey, { ...list, meta: { ...list.meta, page: 2 } })
    const html = render(<DiscoverPage />, cache, '/discover?category=upcoming&genres=18&genre_match=all&page=2')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Coming Soon')
    expect(html).toContain('<time dateTime="2099-12-10">Dec 10, 2099</time>')
    expect(html).toContain('category=upcoming&amp;genres=18&amp;genre_match=all&amp;page=3')
    expect(html).toContain('Remove Drama filter')
  })
  it('separates title search from browse filters and preserves existing incremental search', () => {
    const cache = client()
    cache.setQueryData(searchFeedOptions('space').queryKey, { pages: [{ ...list, data: [{ ...summary, title: 'Search fixture' }] }], pageParams: [1] })
    const html = render(<DiscoverPage />, cache, '/discover?query=space&category=upcoming&genres=18')
    expect(html).toContain('Search fixture')
    expect(html).toContain('Browse filters do not apply')
    expect(html).not.toContain('Browse categories')
    expect(html).toContain('Load more movies manually')
  })
})

describe('independent Home upcoming section', () => {
  it('renders six unique future poster cards in provider order with dates and a deep link', () => {
    const cache = client()
    cache.setQueryData(discoveryOptions({ category: 'upcoming' }).queryKey, { ...list, data: [
      { ...summary, tmdb_id: 80, title: 'Already released', release_date: '2000-01-01' },
      { ...summary, tmdb_id: 81, title: 'No poster', poster_path: null },
      ...Array.from({ length: 8 }, (_, i) => ({ ...summary, tmdb_id: i + 1, title: `Upcoming ${i + 1}` })), summary,
    ] })
    const html = render(<UpcomingMovies />, cache)
    expect(html.match(/class="movie-card"/g)).toHaveLength(6)
    expect(html).toContain('href="/discover?category=upcoming"')
    expect(html).toContain('Explore Upcoming')
    expect(html).toContain('Dec 10, 2099')
    expect(html).not.toContain('Already released')
    expect(html).not.toContain('No poster')
    expect(html).not.toContain('Upcoming 7')
    expect(html.indexOf('Upcoming 1')).toBeLessThan(html.indexOf('Upcoming 6'))
  })
  it('shows cached Popular movies while Upcoming is still pending and keeps section order', () => {
    const cache = client()
    cache.setQueryData(popularOptions(1).queryKey, { ...list, data: [{ ...summary, title: 'Popular loaded' }] })
    const html = render(<PopularMoviesPage />, cache)
    expect(html).toContain('Popular loaded')
    expect(html).toContain('Loading upcoming movies')
    expect(html.indexOf('In the Spotlight')).toBeLessThan(html.indexOf('Worth the Wait'))
    expect(html.indexOf('Worth the Wait')).toBeLessThan(html.indexOf('Popular right now'))
    expect(html).toContain('Load more movies manually')
  })
  it('shows upcoming films while Popular is pending', () => {
    const cache = client()
    cache.setQueryData(discoveryOptions({ category: 'upcoming' }).queryKey, list)
    const html = render(<PopularMoviesPage />, cache)
    expect(html).toContain('Upcoming fixture')
    expect(html).toContain('Loading movies')
  })
  it('isolates an upcoming failure, offers retry and preserves Popular pagination data', async () => {
    const cache = client()
    cache.setQueryData(popularFeedOptions().queryKey, { pages: [{ ...list, data: [{ ...summary, title: 'Popular stays' }] }], pageParams: [1] })
    vi.spyOn(api, 'get').mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { message: 'secret' } } })
    await cache.fetchQuery(discoveryOptions({ category: 'upcoming' })).catch(() => {})
    const html = render(<PopularMoviesPage />, cache)
    expect(html).toContain('The next act is taking a moment.')
    expect(html).toContain('Try again')
    expect(html).toContain('Popular stays')
    expect(html).toContain('Load more movies manually')
    expect(html).not.toContain('secret')
    cache.clear()
  })
  it('provides an empty state and exactly six loading skeletons', () => {
    expect(render(<UpcomingMovies />).match(/skeleton-poster/g)).toHaveLength(6)
    const cache = client()
    cache.setQueryData(discoveryOptions({ category: 'upcoming' }).queryKey, { ...list, data: [] })
    expect(render(<UpcomingMovies />, cache)).toContain('The next chapter is on its way.')
  })
})
