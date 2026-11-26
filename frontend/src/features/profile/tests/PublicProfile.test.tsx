import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoutesFromChildren, MemoryRouter, Route, Routes, type RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../../App'
import { api } from '../../../lib/api/client'
import { PublicOrVerified, RequireAuth } from '../../auth/guards/AuthGuards'
import { accessDestination } from '../../auth/guards/access'
import { authKey, isPrivateSessionQuery, storeAuthenticatedUser } from '../../auth/hooks/useAuth'
import { ReviewCard } from '../../reviews/components/ReviewCard'
import type { Review } from '../../reviews/types/review.types'
import { publicProfileFailure, publicProfileId, readPublicProfile } from '../api/publicProfileApi'
import { profileKey, publicProfileKey } from '../hooks/profileKeys'
import { synchronizeProfile } from '../hooks/useProfile'
import { publicProfileOptions } from '../hooks/usePublicProfile'
import PublicProfilePage from '../pages/PublicProfilePage'
import type { Profile } from '../types/profile.types'
import type { PublicProfile } from '../types/publicProfile.types'

const identity: PublicProfile = { id: 7, username: 'movie_fan', avatar_url: null }
const user = { ...identity, email: 'private@example.test', email_verified_at: '2026-11-03T00:00:00Z' }
const profile: Profile = { user, bio: 'Private biography', member_since: null, statistics: { watched_count: 3, watchlist_count: 5, review_count: 2 } }
const failure = (status: number) => ({ isAxiosError: true, response: { status, data: { message: 'Internal diagnostic must not render' } } })
const clients: QueryClient[] = []
function cache() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  clients.push(client)
  return client
}
function render(client: QueryClient, id = '7', state: unknown = null) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: `/users/${id}`, state }]}><Routes><Route path="/users/:id" element={<PublicProfilePage />} /></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => vi.restoreAllMocks())
afterEach(() => { for (const client of clients.splice(0)) client.clear() })

it('uses one body-free Core GET with cancellation and a three-field projection', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { ...identity, email: user.email, bio: profile.bio } } })
  const signal = new AbortController().signal
  expect(await readPublicProfile(7, signal)).toEqual(identity)
  expect(get).toHaveBeenCalledExactlyOnceWith('/api/v1/users/7', { signal })
  get.mockResolvedValueOnce({ data: { data: { ...identity, id: 8 } } })
  await expect(readPublicProfile(7)).rejects.toThrow('Public profile response is unavailable.')
})

it('rejects noncanonical or unsupported IDs before any request', async () => {
  const get = vi.spyOn(api, 'get')
  for (const raw of [undefined, '', '0', '-1', '01', '+1', '1.2', '1e2', ' 1', '1 ', '1\n', 'abc', '2147483648', '9'.repeat(40)]) {
    expect(publicProfileId(raw)).toBeNull()
  }
  expect(publicProfileId('1')).toBe(1)
  expect(publicProfileId('2147483647')).toBe(2147483647)
  await expect(readPublicProfile(0)).rejects.toThrow('Invalid public profile ID.')
  expect(get).not.toHaveBeenCalled()
  expect(publicProfileOptions(0).enabled).toBe(false)
})

it('isolates public identity by target and revalidates without automatic retries or persistence', () => {
  const options = publicProfileOptions(7)
  expect(options.queryKey).toEqual(publicProfileKey(7))
  expect(options.queryKey).not.toEqual(profileKey(7))
  expect(options.queryKey).not.toEqual(publicProfileOptions(8).queryKey)
  expect(options).toMatchObject({ staleTime: 0, gcTime: 0, retry: false, retryOnMount: false, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchOnReconnect: false })
  expect(isPrivateSessionQuery({ queryKey: options.queryKey })).toBe(true)
})

it('renders only public identity, safe avatar fallback and movie return context', () => {
  const client = cache()
  client.setQueryData(publicProfileKey(7), { ...identity, email: user.email, bio: profile.bio, statistics: profile.statistics })
  const html = render(client, '7', { publicProfileFrom: '/movies/550?from=%2Fdiscover#reviews' })
  expect(html).toContain('@movie_fan')
  expect(html).toContain('user-avatar')
  expect(html).toContain('>M</span>')
  expect(html).toContain('href="/movies/550?from=%2Fdiscover#reviews"')
  expect(html).toContain('Back to movie')
  expect(html).not.toMatch(/private@example|Private biography|Watched|Watchlist|Follow|Edit profile/)
  client.setQueryData(publicProfileKey(7), { ...identity, avatar_url: 'https://core.test/avatar.webp' })
  expect(render(client)).toContain('src="https://core.test/avatar.webp"')
})

it('shows loading and invalid states without leaking identity cached for another target', () => {
  const client = cache()
  client.setQueryData(publicProfileKey(7), identity)
  expect(render(client, '8')).toContain('Loading public profile')
  expect(render(client, '8')).not.toContain('@movie_fan')
  const invalid = render(client, '01')
  expect(invalid).toContain('Invalid profile link')
  expect(invalid).toContain('href="/discover"')
  expect(client.getQueryCache().find({ queryKey: publicProfileKey(1) })).toBeUndefined()
})

it('hides retained identity after authoritative unavailable, invalid or rate-limit errors', () => {
  const client = cache()
  for (const [status, label] of [[404, 'Profile unavailable'], [422, 'Invalid profile link'], [429, 'Please wait a minute']] as const) {
    client.setQueryData(publicProfileKey(7), identity)
    client.getQueryCache().find({ queryKey: publicProfileKey(7) })!.setState({ status: 'error', error: failure(status) as unknown as Error })
    const html = render(client)
    expect(html).toContain(label)
    expect(html).not.toContain('@movie_fan')
    expect(html).not.toContain('Try again</button>')
    expect(html).not.toContain('Internal diagnostic')
  }
})

it('offers a safe controlled retry for server failures', async () => {
  const client = cache()
  const get = vi.spyOn(api, 'get').mockRejectedValue(failure(500))
  const observer = new QueryObserver(client, publicProfileOptions(7))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
    const html = render(client)
    expect(html).toContain('This profile couldn’t load')
    expect(html).toContain('Try again')
    expect(html).not.toContain('Internal diagnostic')
    get.mockResolvedValue({ data: { data: identity } })
    await observer.getCurrentResult().refetch()
    expect(observer.getCurrentResult().data).toEqual(identity)
    expect(get).toHaveBeenCalledTimes(2)
  } finally { unsubscribe() }
  expect(publicProfileFailure(new Error('Private diagnostics')).retry).toBe(true)
})

it('does not reuse previous data when an observed target changes', async () => {
  const client = cache()
  vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: identity } }).mockImplementationOnce(() => new Promise(() => {}))
  const observer = new QueryObserver(client, publicProfileOptions(7))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(identity))
    observer.setOptions(publicProfileOptions(8))
    expect(observer.getCurrentResult().data).toBeUndefined()
    expect(observer.getCurrentResult().isPending).toBe(true)
  } finally { unsubscribe() }
})

it('invalidates only the changed public identity plus existing author projections', async () => {
  const client = cache()
  client.setQueryData(authKey, user)
  client.setQueryData(publicProfileKey(7), identity)
  client.setQueryData(publicProfileKey(8), { ...identity, id: 8 })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  expect(await synchronizeProfile(client, 7, { ...profile, user: { ...user, username: 'updated_member' } })).toBe(true)
  expect(invalidate).toHaveBeenCalledWith({ queryKey: publicProfileKey(7), exact: true })
  expect(client.getQueryState(publicProfileKey(7))?.isInvalidated).toBe(true)
  expect(client.getQueryState(publicProfileKey(8))?.isInvalidated).toBe(false)
  expect(invalidate.mock.calls.some(([filter]) => filter?.queryKey?.[0] === 'movies' || filter?.queryKey?.[0] === 'recommendations')).toBe(false)
})

it('retains existing account-switch cleanup for public queries and guards late profile edits', async () => {
  const client = cache()
  client.setQueryData(authKey, user)
  client.setQueryData(publicProfileKey(7), identity)
  await storeAuthenticatedUser(client, { ...user, id: 8 })
  expect(client.getQueryData(publicProfileKey(7))).toBeUndefined()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  expect(await synchronizeProfile(client, 7, profile)).toBe(false)
  expect(invalidate).not.toHaveBeenCalled()
})

it('keeps return links local and provides a useful fallback for direct visits', () => {
  const client = cache()
  expect(render(client, '7', { publicProfileFrom: '/movies/550' })).toContain('href="/movies/550"')
  for (const from of ['https://external.test', '//external.test', '/users/7', '/movies/550\n', '/movies/550\\external', '/login']) {
    expect(render(client, '7', { publicProfileFrom: from })).toContain('href="/discover"')
  }
  expect(render(client)).toContain('href="/discover"')
})

it('links review authors while keeping spoilers and independent controls intact', () => {
  const review: Review = { id: 4, tmdb_id: 550, author: identity, body: 'Secret plot details', contains_spoilers: true, created_at: null, updated_at: null }
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/movies/550']}><ReviewCard review={review} onEdit={() => {}} onDelete={() => {}} onReport={() => {}} /></MemoryRouter>)
  expect(html).toContain('href="/users/7"')
  expect(html).toContain('View @movie_fan’s public profile')
  expect(html).toContain('Reveal review')
  expect(html).not.toContain('Secret plot details')
  for (const control of ['Edit', 'Delete', 'Report']) expect(html).toContain(`${control} review by movie_fan`)
  expect(html.match(/<a /g)).toHaveLength(1)
})

it('registers the public route outside RequireAuth while preserving private route guards', () => {
  const routes = createRoutesFromChildren(App().props.children)
  const ancestors = (path: string, tree: RouteObject[] = routes, parents: unknown[] = []): unknown[] | undefined => {
    for (const route of tree) {
      const element = route.element as { type?: unknown } | null
      const chain = [...parents, element?.type]
      if (route.path === path) return chain
      const nested = route.children && ancestors(path, route.children, chain)
      if (nested) return nested
    }
  }
  expect(ancestors('/users/:id')).toContain(PublicOrVerified)
  expect(ancestors('/users/:id')).not.toContain(RequireAuth)
  expect(ancestors('/profile')).toContain(RequireAuth)
  expect(accessDestination(null, false)).toBeNull()
  expect(accessDestination({ ...user, email_verified_at: null }, false)).toBe('/verify-email')
})
