import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { LibraryActions } from '../components/LibraryActions'
import LibraryPage from '../pages/LibraryPage'
import { changeMembership, libraryError, libraryPage, libraryState } from '../api/libraryApi'
import { libraryKeys, libraryOptions, stateOptions } from '../hooks/useLibrary'
import { trailerEmbed } from '../../movies/lib/trailer'
import { MovieDetailsPage } from '../../movies/pages/MovieDetailsPage'
import { detailOptions, experienceOptions } from '../../movies/hooks/useMovies'

const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-10-31T00:00:00Z' }
const movie = { tmdb_id: 550, title: 'Fixture film', poster_path: null, backdrop_path: null, overview: 'Fixture story', release_date: '2000-01-01', tmdb_rating: 8, tmdb_vote_count: 40, runtime: 90, original_language: 'en', original_title: 'Fixture film', genres: [] }
const trailer = { key: 'official123', name: 'Official trailer', site: 'YouTube' as const, type: 'Trailer' as const, official: true }
function cache() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
  client.setQueryData(authKey, user)
  return client
}
function render(node: React.ReactNode, client = cache(), url = '/library/watchlist') {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{node}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => vi.restoreAllMocks())

it('uses Core paths, pagination, cancellation and fresh CSRF before writes', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: {} } })
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { tmdb_id: 550 } } })
  const del = vi.spyOn(api, 'delete').mockResolvedValue({})
  const signal = new AbortController().signal
  await libraryPage('watched', 2, signal)
  expect(get).toHaveBeenLastCalledWith('/api/v1/me/watched', { params: { page: 2, per_page: 20 }, signal })
  await libraryState(550, signal)
  expect(get).toHaveBeenLastCalledWith('/api/v1/me/movies/550/library-state', { signal })
  await changeMembership('watchlist', 550, true)
  expect(get).toHaveBeenLastCalledWith('/sanctum/csrf-cookie')
  expect(post).toHaveBeenCalledWith('/api/v1/me/watchlist', { tmdb_id: 550 })
  await changeMembership('watched', 550, false)
  expect(del).toHaveBeenCalledWith('/api/v1/me/watched/550')
})
it('does not dispatch a write if the account changed during CSRF bootstrap', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post')
  await expect(changeMembership('watchlist', 550, true, () => false)).rejects.toThrow('account changed')
  expect(post).not.toHaveBeenCalled()
})
it('separates owners, lists, pages and state without including discovery', () => {
  expect(libraryOptions(7, 'watchlist', 1).queryKey).not.toEqual(libraryOptions(8, 'watchlist', 1).queryKey)
  expect(libraryOptions(7, 'watchlist', 1).queryKey).not.toEqual(libraryOptions(7, 'watched', 1).queryKey)
  expect(libraryOptions(7, 'watchlist', 1).queryKey).not.toEqual(libraryOptions(7, 'watchlist', 2).queryKey)
  expect(stateOptions(0, 550).enabled).toBe(false)
  expect(libraryKeys.owner(7)).toEqual(['library', 7])
})
it.each([401, 403, 419, 422, 429, 503])('provides safe context-specific feedback for %s', status => {
  const message = libraryError({ isAxiosError: true, response: { status, data: { message: 'secret' } } })
  expect(message).not.toContain('secret')
  expect(message).not.toContain('Invalid email or password')
  expect(message.length).toBeGreaterThan(15)
})
it('renders independent server-confirmed membership states', () => {
  const client = cache()
  client.setQueryData(libraryKeys.state(7, 550), { tmdb_id: 550, in_watchlist: true, watched_at: null })
  const html = render(<LibraryActions id={550} />, client)
  expect(html).toContain('aria-label="Remove from Watchlist"')
  expect(html).toContain('aria-label="Mark as Watched"')
  expect(html).not.toContain('Saved to Watchlist.')
})
it('offers real sign-in and verification destinations without mutation controls', () => {
  const client = cache()
  client.setQueryData(authKey, null)
  expect(render(<LibraryActions id={550} />, client)).toContain('Sign in to save this movie')
  client.setQueryData(authKey, { ...user, email_verified_at: null })
  expect(render(<LibraryActions id={550} />, client)).toContain('Verify email to save movies')
})
it('preserves missing rows, counts and removal during a metadata outage', () => {
  const client = cache()
  client.setQueryData(libraryOptions(7, 'watchlist', 1).queryKey, { data: [{ tmdb_id: 550, created_at: '2026-10-31', movie: null, metadata_status: 'unavailable' }], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1, metadata_unavailable: true } })
  const html = render(<LibraryPage kind="watchlist" />, client)
  expect(html).toContain('TMDB 550')
  expect(html).toContain('Your saved films are safe')
  expect(html).toContain('Remove TMDB 550 from watchlist')
  expect(html).not.toContain('Your next great film starts here')
})
it('shows empty libraries and page navigation distinctly', () => {
  const client = cache()
  client.setQueryData(libraryOptions(7, 'watched', 1).queryKey, { data: [], meta: { page: 1, per_page: 20, total_pages: 0, total_results: 0, metadata_unavailable: false } })
  expect(render(<LibraryPage kind="watched" />, client)).toContain('Mark a movie as watched')
  expect(render(<LibraryPage kind="watched" />, client, '/library/watched?page=0')).toContain('Go to the first page')
})
it('only builds an allowlisted privacy-enhanced player URL', () => {
  expect(trailerEmbed(trailer)).toBe('https://www.youtube-nocookie.com/embed/official123?autoplay=1&rel=0')
  expect(trailerEmbed({ ...trailer, key: 'https://evil.test' })).toBeNull()
  expect(trailerEmbed(null)).toBeNull()
})
it('renders supplied extras but never loads an iframe before an explicit play action', () => {
  const client = cache()
  client.setQueryData(detailOptions('550').queryKey, { data: movie, meta: { stale: false } })
  client.setQueryData(experienceOptions('550').queryKey, { data: { tmdb_id: 550, tagline: 'Fixture tagline', trailer, cast: [{ tmdb_id: 1, name: 'Fixture actor', character: 'Role', profile_path: null }], directors: [{ tmdb_id: 2, name: 'Fixture director' }], related: [movie] }, meta: { stale: false } })
  const node = <Routes><Route path="/movies/:tmdbId" element={<MovieDetailsPage />} /></Routes>
  const html = render(node, client, '/movies/550')
  expect(html).toContain('Watch Trailer')
  expect(html).toContain('Fixture actor')
  expect(html).toContain('Fixture director')
  expect(html).toContain('Related films from TMDB')
  expect(html).not.toContain('<iframe')
  client.setQueryData(experienceOptions('550').queryKey, { data: { tmdb_id: 550, tagline: null, trailer: null, cast: [], directors: [], related: [] }, meta: { stale: false } })
  expect(render(node, client, '/movies/550')).toContain('No trailer is available')
})
