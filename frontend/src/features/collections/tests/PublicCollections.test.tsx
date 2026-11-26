import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoutesFromChildren, MemoryRouter, Route, Routes, type RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../../App'
import { api } from '../../../lib/api/client'
import { accessKey } from '../../auth/hooks/useAccess'
import { authKey, isPrivateSessionQuery, storeAuthenticatedUser } from '../../auth/hooks/useAuth'
import { PublicOrVerified, RequireAuth } from '../../auth/guards/AuthGuards'
import PublicProfilePage from '../../profile/pages/PublicProfilePage'
import { publicProfileKey } from '../../profile/hooks/profileKeys'
import { synchronizeProfile } from '../../profile/hooks/useProfile'
import { changeCollection } from '../api/collectionsApi'
import { publicCollection, publicCollectionFailure, publicCollectionMovies, publicCollections, publicPage } from '../api/publicCollectionsApi'
import { CollectionCard } from '../components/CollectionCard'
import { CollectionForm } from '../components/CollectionForm'
import SaveCollectionDialog from '../components/SaveCollectionDialog'
import { collectionKeys, collectionsOptions, synchronizeCollections } from '../hooks/useCollections'
import { publicCollectionKeys, publicCollectionOptions, publicCollectionMoviesOptions, publicCollectionsOptions } from '../hooks/usePublicCollections'
import PublicCollectionPage from '../pages/PublicCollectionPage'
import type { Collection } from '../types/collection.types'
import type { PublicCollection } from '../types/publicCollection.types'
import { MovieDetailsPage } from '../../movies/pages/MovieDetailsPage'

const creator = { id: 7, username: 'cinema_member', avatar_url: null }
const user = { ...creator, email: 'private@example.test', email_verified_at: '2026-11-01T00:00:00Z' }
const collection: Collection = { id: 4, name: 'Weekend', description: 'Quiet films', visibility: 'private', movie_count: 1, system_key: null, created_at: null, updated_at: null }
const shared: PublicCollection = { id: 4, name: 'Weekend', description: 'Quiet films', movie_count: 1, creator, preview_movies: [{ tmdb_id: 550, title: 'Fixture', poster_path: null }] }
const meta = { page: 1, per_page: 20, total_pages: 2, total_results: 21 }
const failure = (status: number) => ({ isAxiosError: true, response: { status, data: { message: 'Private diagnostic' } } })
const clients: QueryClient[] = []
function cache(status = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  client.setQueryData(authKey, user)
  client.setQueryData(accessKey(7), { role: 'user', account_status: status })
  clients.push(client)
  return client
}
function render(node: React.ReactNode, client: QueryClient, path = '/collections/4') {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>)
}
const detail = <Routes><Route path="/collections/:id" element={<PublicCollectionPage />} /></Routes>
const profile = <Routes><Route path="/users/:id" element={<PublicProfilePage />} /></Routes>
function seed(client: QueryClient) {
  client.setQueryData(publicCollectionOptions(4).queryKey, shared)
  client.setQueryData(publicCollectionsOptions(7, 1).queryKey, { data: [shared], meta: { ...meta, preview_metadata_unavailable: false } })
  client.setQueryData(publicCollectionMoviesOptions(4, 1).queryKey, { data: [{ tmdb_id: 550, movie: null, metadata_status: 'unavailable' }], meta: { ...meta, metadata_unavailable: true } })
}
beforeEach(() => vi.restoreAllMocks())
afterEach(() => clients.splice(0).forEach(client => client.clear()))

it('uses body-free public Core endpoints with only approved bounded pagination and cancellation', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: shared, meta } })
  const signal = new AbortController().signal
  await publicCollection(4, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/collections/4', { signal })
  await publicCollections(7, 2, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/users/7/collections', { params: { page: 2, per_page: 20 }, signal })
  await publicCollectionMovies(4, 3, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/collections/4/movies', { params: { page: 3, per_page: 20 }, signal })
  for (const raw of ['0', '01', '10001', '1\n', '-1', 'bad']) expect(publicPage(raw)).toBeNull()
  expect(publicPage(null)).toBe(1)
  expect(publicPage('10000')).toBe(10000)
  await expect(publicCollection(0)).rejects.toThrow('Invalid collection link')
  await expect(publicCollections(7, 10001)).rejects.toThrow('Invalid collection link')
  expect(get).toHaveBeenCalledTimes(3)
})

it('keeps owner, author, collection and movie page query identities distinct and nonpersistent', () => {
  const keys = [collectionKeys.detail(7, 4), publicCollectionsOptions(7, 1).queryKey, publicCollectionsOptions(8, 1).queryKey,
    publicCollectionsOptions(7, 2).queryKey, publicCollectionOptions(4).queryKey, publicCollectionOptions(5).queryKey,
    publicCollectionMoviesOptions(4, 1).queryKey, publicCollectionMoviesOptions(4, 2).queryKey]
  expect(new Set(keys.map(key => JSON.stringify(key))).size).toBe(keys.length)
  for (const options of [publicCollectionsOptions(7, 1), publicCollectionOptions(4), publicCollectionMoviesOptions(4, 1)]) {
    expect(options).toMatchObject({ staleTime: 0, gcTime: 0, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: true })
    expect(isPrivateSessionQuery({ queryKey: options.queryKey })).toBe(true)
  }
  expect(publicCollectionOptions(0).enabled).toBe(false)
})

it('defaults forms to private and reflects actual public visibility for active owners', () => {
  const client = cache()
  const form = (c?: Collection) => render(<CollectionForm owner={7} collection={c} onSaved={() => {}} onCancel={() => {}} />, client)
  expect(form()).toContain('value="private" selected=""')
  const html = form({ ...collection, visibility: 'public' })
  expect(html).toContain('value="public" selected=""')
  expect(html).toContain('including visitors who are signed out')
  expect(html).toContain('Visibility')
  expect(html).toContain('Collection name')
})

it('restricts public editing to withdrawal only while private forms and Favorites protections remain', () => {
  const client = cache('restricted')
  const form = (c?: Collection) => render(<CollectionForm owner={7} collection={c} onSaved={() => {}} onCancel={() => {}} />, client)
  const withdrawal = form({ ...collection, visibility: 'public' })
  expect(withdrawal).toContain('Make private')
  expect(withdrawal).not.toContain('<textarea')
  expect(withdrawal).not.toContain('Collection name')
  expect(form()).toContain('value="public" disabled=""')
  expect(form(collection)).toContain('Save changes')
  const favorites = form({ ...collection, system_key: 'favorites' })
  expect(favorites).toContain('always private')
  expect(favorites).not.toContain('<select')
})

it('sends explicit public creation, visibility-only withdrawal and preserves create-then-save calls', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { ...collection, visibility: 'public' } } })
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: collection } })
  const values = { name: 'Weekend', description: null, visibility: 'public' as const }
  const created = await changeCollection({ action: 'create', values }, () => true)
  await changeCollection({ action: 'membership', id: created!.id, tmdbId: 550, add: true }, () => true)
  expect(post).toHaveBeenNthCalledWith(1, '/api/v1/me/collections', values)
  expect(post).toHaveBeenNthCalledWith(2, '/api/v1/me/collections/4/movies', { tmdb_id: 550 })
  await changeCollection({ action: 'edit', id: 4, values: { visibility: 'private' } }, () => true)
  expect(patch).toHaveBeenCalledExactlyOnceWith('/api/v1/me/collections/4', { visibility: 'private' })
  expect(get).toHaveBeenCalledTimes(3)
})

it('prevents restricted public additions but retains existing membership removals in save choices', () => {
  const client = cache('restricted')
  client.setQueryData(collectionsOptions(7, 1, 550, false).queryKey, { data: [{ ...collection, visibility: 'public', contains_movie: false }], meta })
  const dialog = () => render(<SaveCollectionDialog owner={7} movie={550} title="Fixture" onClose={() => {}} />, client)
  expect(dialog()).toContain('type="checkbox" disabled=""')
  client.setQueryData(collectionsOptions(7, 1, 550, false).queryKey, { data: [{ ...collection, visibility: 'public', contains_movie: true }], meta })
  const selected = dialog()
  expect(selected).toContain('checked=""')
  expect(selected).not.toContain('type="checkbox" disabled=""')
})

it('reuses poster cards with accurate labels and public destinations without owner controls', () => {
  const client = cache()
  const html = render(<ul><CollectionCard collection={shared} publicView onEdit={() => {}} onDelete={() => {}} /></ul>, client)
  expect(html).toContain('href="/collections/4"')
  expect(html).toContain('Public collection')
  expect(html).not.toContain('Edit')
  expect(html).not.toContain('Delete')
  const owner = render(<ul><CollectionCard collection={{ ...collection, visibility: 'public' }} /></ul>, client)
  expect(owner).toContain('href="/library/collections/4"')
  expect(owner).toContain('Open public page')
})

it('extends profiles with public cards and pagination while retaining identity and omitting private data', () => {
  const client = cache()
  seed(client)
  client.setQueryData(publicProfileKey(7), creator)
  const html = render(profile, client, '/users/7')
  expect(html).toContain('@cinema_member')
  expect(html).toContain('Public collections')
  expect(html).toContain('href="/collections/4"')
  expect(html).toContain('href="/users/7?page=2"')
  expect(html).not.toContain('private@example')
  expect(html).not.toContain('Edit collection')
})

it('never renders cached collections after the parent identity becomes unavailable', () => {
  const client = cache()
  seed(client)
  client.setQueryData(publicProfileKey(7), creator)
  client.getQueryCache().find({ queryKey: publicProfileKey(7) })!.setState({ status: 'error', error: failure(404) as unknown as Error })
  const html = render(profile, client, '/users/7')
  expect(html).toContain('Profile unavailable')
  expect(html).not.toContain('Weekend')
  expect(html).not.toContain('Public collections')
})

it('renders public detail, safe creator navigation and missing metadata without owner actions', () => {
  const client = cache()
  seed(client)
  const html = render(detail, client)
  expect(html).toContain('Weekend')
  expect(html).toContain('Curated by @cinema_member')
  expect(html).toContain('href="/users/7"')
  expect(html).toContain('TMDB 550')
  expect(html).toContain('Retry movie information')
  expect(html).toContain('href="/collections/4?page=2"')
  expect(html).not.toMatch(/Edit collection|Delete collection|Remove TMDB|private@example/)
})

it('handles direct loading, invalid identifiers, pages and empty author lists', () => {
  const client = cache()
  expect(render(detail, client)).toContain('Opening public collection')
  expect(render(detail, client, '/collections/01')).toContain('Invalid collection link')
  seed(client)
  expect(render(detail, client, '/collections/4?page=0')).toContain('Invalid page')
  client.setQueryData(publicProfileKey(7), creator)
  client.setQueryData(publicCollectionsOptions(7, 1).queryKey, { data: [], meta: { ...meta, total_results: 0, total_pages: 0, preview_metadata_unavailable: false } })
  expect(render(profile, client, '/users/7')).toContain('No public collections yet')
})

it.each([404, 422, 429, 500])('hides retained public detail after error %s and offers only controlled recoverable retry', status => {
  const client = cache()
  seed(client)
  client.getQueryCache().find({ queryKey: publicCollectionOptions(4).queryKey })!.setState({ status: 'error', error: failure(status) as unknown as Error })
  const html = render(detail, client)
  expect(html).not.toContain('Weekend')
  expect(html).not.toContain('Private diagnostic')
  expect(html.includes('Try again')).toBe(status === 500)
})

it('hides the entire detail identity when movie retrieval authoritatively denies access', () => {
  const client = cache()
  seed(client)
  client.getQueryCache().find({ queryKey: publicCollectionMoviesOptions(4, 1).queryKey })!.setState({ status: 'error', error: failure(404) as unknown as Error })
  const html = render(detail, client)
  expect(html).toContain('Collection unavailable')
  expect(html).not.toContain('Weekend')
  expect(html).not.toContain('cinema_member')
})

it.each(['withdraw', 'delete'] as const)('evicts affected public queries after confirmed %s while preserving other members and private views', async action => {
  const client = cache()
  seed(client)
  client.setQueryData(publicCollectionOptions(5).queryKey, { ...shared, id: 5, creator: { ...creator, id: 8 } })
  client.setQueryData(publicCollectionsOptions(8, 1).queryKey, { data: [], meta: { ...meta, preview_metadata_unavailable: false } })
  client.setQueryData(['movies', 'detail', 550], 'unchanged')
  client.setQueryData(['library', 7, 'watchlist'], 'unchanged')
  await synchronizeCollections(client, 7, action === 'withdraw' ? { action: 'edit', id: 4, values: { visibility: 'private' } } : { action: 'delete', id: 4 }, action === 'withdraw' ? collection : null)
  expect(client.getQueryData(publicCollectionOptions(4).queryKey)).toBeUndefined()
  expect(client.getQueryData(publicCollectionMoviesOptions(4, 1).queryKey)).toBeUndefined()
  expect(client.getQueryData(publicCollectionsOptions(7, 1).queryKey)).toBeUndefined()
  expect(client.getQueryData(publicCollectionOptions(5).queryKey)).toBeDefined()
  expect(client.getQueryState(publicCollectionsOptions(8, 1).queryKey)?.isInvalidated).toBe(false)
  expect(client.getQueryState(['movies', 'detail', 550])?.isInvalidated).toBe(false)
})

it('cancels stale in-flight data and resets active observers instead of leaving withdrawn content visible', async () => {
  const client = cache()
  let finish!: (value: unknown) => void
  let signal: AbortSignal | undefined
  const get = vi.spyOn(api, 'get').mockImplementationOnce((_url, config) => { signal = config?.signal as AbortSignal; return new Promise(resolve => { finish = resolve }) })
    .mockRejectedValue(failure(404))
  client.setQueryData(publicCollectionOptions(4).queryKey, shared)
  const observer = new QueryObserver(client, publicCollectionOptions(4))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    await synchronizeCollections(client, 7, { action: 'edit', id: 4, values: { visibility: 'private' } }, collection)
    expect(signal?.aborted).toBe(true)
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true))
    expect(observer.getCurrentResult().data).toBeUndefined()
    finish({ data: { data: shared } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(observer.getCurrentResult().data).toBeUndefined()
  } finally { unsubscribe() }
})

it('invalidates public creator projections after profile edits without touching other creators', async () => {
  const client = cache()
  seed(client)
  client.setQueryData(publicCollectionOptions(5).queryKey, { ...shared, id: 5, creator: { ...creator, id: 8 } })
  await synchronizeProfile(client, 7, { user: { ...user, username: 'updated' }, bio: null, member_since: null, statistics: { watched_count: 0, watchlist_count: 0, review_count: 0 } })
  expect(client.getQueryState(publicCollectionOptions(4).queryKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(publicCollectionsOptions(7, 1).queryKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(publicCollectionOptions(5).queryKey)?.isInvalidated).toBe(false)
})

it('preserves auth cleanup and rejects old-account mutation completion', async () => {
  const client = cache()
  seed(client)
  await storeAuthenticatedUser(client, { ...user, id: 8 })
  expect(client.getQueryData(publicCollectionOptions(4).queryKey)).toBeUndefined()
  expect(await synchronizeCollections(client, 7, { action: 'delete', id: 4 }, null)).toBe(false)
})

it('registers the collection route under public verification policy outside owner guards', () => {
  const walk = (routes: RouteObject[], parents: unknown[] = []): unknown[] | undefined => {
    for (const route of routes) {
      const chain = [...parents, (route.element as { type?: unknown })?.type]
      if (route.path === '/collections/:id') return chain
      const child = route.children && walk(route.children, chain)
      if (child) return child
    }
  }
  const guards = walk(createRoutesFromChildren(App().props.children))
  expect(guards).toContain(PublicOrVerified)
  expect(guards).not.toContain(RequireAuth)
  expect(publicCollectionFailure(failure(429)).retry).toBe(false)
  expect(publicCollectionKeys.detail(4)[0]).toBe('public-collections')
})

it('returns from movie details to a local public collection page and rejects external return paths', () => {
  const client = cache()
  client.setQueryDefaults(['movies', 'detail'], { retryOnMount: false })
  const query = client.getQueryCache().build(client, { queryKey: ['movies', 'detail', '550'] })
  query.setState({ status: 'error', error: failure(404) as unknown as Error })
  const html = (from: string) => renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: '/movies/550', state: { from } }]}><Routes><Route path="/movies/:tmdbId" element={<MovieDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>)
  expect(html('/collections/4?page=2')).toContain('href="/collections/4?page=2"')
  expect(html('//external.test')).toContain('href="/discover"')
})
