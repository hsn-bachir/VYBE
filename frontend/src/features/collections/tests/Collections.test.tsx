import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { libraryKeys } from '../../library/hooks/useLibrary'
import { changeCollection, collectionDetails, collectionError, collectionMovies, collectionsPage } from '../api/collectionsApi'
import { collectionKeys, collectionMoviesOptions, collectionOptions, collectionsOptions, synchronizeCollections } from '../hooks/useCollections'
import CollectionsPage from '../pages/CollectionsPage'
import CollectionDetailsPage from '../pages/CollectionDetailsPage'
import SaveCollectionDialog from '../components/SaveCollectionDialog'
import { CollectionForm } from '../components/CollectionForm'
import { DeleteCollectionDialog } from '../components/DeleteCollectionDialog'
import type { Collection, CollectionsResponse } from '../types/collection.types'

const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-11-01T00:00:00Z' }
const collection: Collection = { id: 4, name: 'Favorites', description: 'Quiet evenings', movie_count: 2, created_at: '2026-11-01T00:00:00Z', updated_at: null }
const pageOf = (data: Collection[], page = 1, total = data.length): CollectionsResponse => ({ data, meta: { page, per_page: 20, total_pages: Math.ceil(total / 20), total_results: total } })
function cache() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
  client.setQueryData(authKey, user)
  return client
}
function render(node: React.ReactNode, client = cache(), url = '/library/collections') {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{node}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => vi.restoreAllMocks())

it('uses only Core collection paths, bounded pages, signal forwarding and membership annotation', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } })
  const signal = new AbortController().signal
  await collectionsPage(2, 550, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/me/collections', { params: { page: 2, per_page: 20, contains_tmdb_id: 550 }, signal })
  await collectionDetails(4, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/me/collections/4', { signal })
  await collectionMovies(4, 3, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/me/collections/4/movies', { params: { page: 3, per_page: 20 }, signal })
})
it('bootstraps CSRF for create, edit, delete and each membership operation', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: collection } })
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: collection } })
  const del = vi.spyOn(api, 'delete').mockResolvedValue({})
  const values = { name: 'Favorites', description: null }
  expect(await changeCollection({ action: 'create', values }, () => true)).toEqual(collection)
  await changeCollection({ action: 'edit', id: 4, values }, () => true)
  await changeCollection({ action: 'membership', id: 4, tmdbId: 550, add: true }, () => true)
  await changeCollection({ action: 'membership', id: 4, tmdbId: 550, add: false }, () => true)
  await changeCollection({ action: 'delete', id: 4 }, () => true)
  expect(get).toHaveBeenCalledTimes(5)
  expect(post).toHaveBeenCalledWith('/api/v1/me/collections', values)
  expect(patch).toHaveBeenCalledWith('/api/v1/me/collections/4', values)
  expect(post).toHaveBeenCalledWith('/api/v1/me/collections/4/movies', { tmdb_id: 550 })
  expect(del).toHaveBeenCalledWith('/api/v1/me/collections/4/movies/550')
  expect(del).toHaveBeenCalledWith('/api/v1/me/collections/4')
})
it('rejects a late write when the account changes during CSRF', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post')
  await expect(changeCollection({ action: 'create', values: { name: 'A', description: null } }, () => false)).rejects.toThrow('account changed')
  expect(post).not.toHaveBeenCalled()
})
it('keeps owner, page and movie annotation in query identity', () => {
  expect(collectionsOptions(7, 1).queryKey).not.toEqual(collectionsOptions(8, 1).queryKey)
  expect(collectionsOptions(7, 1).queryKey).not.toEqual(collectionsOptions(7, 1, 550).queryKey)
  expect(collectionsOptions(7, 1, 550).queryKey).not.toEqual(collectionsOptions(7, 2, 550).queryKey)
  expect(collectionMoviesOptions(7, 4, 1).queryKey).not.toEqual(collectionMoviesOptions(7, 5, 1).queryKey)
  expect(collectionOptions(7, 0).enabled).toBe(false)
  expect(collectionsOptions(0, 1).enabled).toBe(false)
})
it.each([401, 403, 404, 419, 422, 429, 503])('provides safe collection errors for %s', status => {
  const message = collectionError({ isAxiosError: true, response: { status, data: { message: 'secret' } } }, true)
  expect(message).not.toContain('secret')
  expect(message).not.toContain('Invalid email or password')
  expect(message.length).toBeGreaterThan(15)
})
it('renders duplicate names with distinct IDs, counts, descriptions and collection links', () => {
  const client = cache()
  client.setQueryData(collectionsOptions(7, 1).queryKey, pageOf([collection, { ...collection, id: 5 }]))
  const html = render(<CollectionsPage />, client)
  expect(html).toContain('/library/collections/4')
  expect(html).toContain('/library/collections/5')
  expect(html).toContain('2 movies')
  expect(html).toContain('Quiet evenings')
  expect(html).toContain('collection 4')
  expect(html).toContain('collection 5')
  expect(html).toContain('Watched')
})
it('renders empty, loading, invalid page and pagination states distinctly', () => {
  const client = cache()
  expect(render(<CollectionsPage />, client)).toContain('Loading collections')
  client.setQueryData(collectionsOptions(7, 1).queryKey, pageOf([]))
  expect(render(<CollectionsPage />, client)).toContain('Create your first collection')
  expect(render(<CollectionsPage />, client, '/library/collections?page=0')).toContain('Go to the first page')
  client.setQueryData(collectionsOptions(7, 1).queryKey, pageOf([collection], 1, 21))
  expect(render(<CollectionsPage />, client)).toContain('Next')
})
it('escapes plain text descriptions and reuses editable field labels', () => {
  const html = render(<CollectionForm owner={7} collection={{ ...collection, description: '<script>bad()</script>' }} onSaved={() => {}} onCancel={() => {}} />)
  expect(html).toContain('Collection name')
  expect(html).toContain('Description')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('Save changes')
})
it('delete dialog identifies the destructive scope and retains a safe cancel action', () => {
  const html = render(<DeleteCollectionDialog owner={7} collection={collection} onDeleted={() => {}} onClose={() => {}} />)
  expect(html).toContain('<dialog')
  expect(html).toContain('aria-labelledby')
  expect(html).toContain('Watchlist, Watched and other collections are unaffected')
  expect(html).toContain('Keep collection')
})
it('save dialog labels duplicate names and reflects only confirmed membership states', () => {
  const client = cache()
  client.setQueryData(collectionsOptions(7, 1, 550).queryKey, pageOf([{ ...collection, contains_movie: true }, { ...collection, id: 5, contains_movie: false }]))
  const html = render(<SaveCollectionDialog owner={7} movie={550} title="Fixture movie" onClose={() => {}} />, client)
  expect(html).toContain('Save Fixture movie')
  expect(html).toContain('Favorites, collection 4')
  expect(html).toContain('Favorites, collection 5')
  expect(html.match(/checked=""/g)).toHaveLength(1)
  expect(html).toContain('Create new collection')
})
it('collection details preserve unavailable metadata rows and removal', () => {
  const client = cache()
  client.setQueryData(collectionOptions(7, 4).queryKey, collection)
  client.setQueryData(collectionMoviesOptions(7, 4, 1).queryKey, { data: [{ tmdb_id: 550, created_at: '2026-11-01T00:00:00Z', movie: null, metadata_status: 'unavailable' }], meta: { page: 1, per_page: 20, total_results: 1, total_pages: 1, metadata_unavailable: true } })
  const html = render(<Routes><Route path="/library/collections/:id" element={<CollectionDetailsPage />} /></Routes>, client, '/library/collections/4')
  expect(html).toContain('Your collection is safe')
  expect(html).toContain('Remove TMDB 550 from collection')
  expect(html).not.toContain('This collection is empty')
})
it('updates confirmed membership across cached pages without touching other collections or library data', async () => {
  const client = cache()
  const first = collectionKeys.list(7, 1, 550), second = collectionKeys.list(7, 2, 550)
  client.setQueryData(first, pageOf([{ ...collection, contains_movie: false }, { ...collection, id: 5, contains_movie: true }]))
  client.setQueryData(second, pageOf([{ ...collection, contains_movie: false }], 2))
  client.setQueryData(['movies', 'detail', '550'], 'metadata')
  client.setQueryData(libraryKeys.list(7, 'watchlist'), 'watchlist')
  await synchronizeCollections(client, 7, { action: 'membership', id: 4, tmdbId: 550, add: true }, null)
  for (const key of [first, second]) {
    expect(client.getQueryData<CollectionsResponse>(key)?.data[0].contains_movie).toBe(true)
    expect(client.getQueryData<CollectionsResponse>(key)?.data[0].movie_count).toBe(3)
  }
  expect(client.getQueryData<CollectionsResponse>(first)?.data[1].contains_movie).toBe(true)
  expect(client.getQueryState(['movies', 'detail', '550'])?.isInvalidated).toBe(false)
  expect(client.getQueryState(libraryKeys.list(7, 'watchlist'))?.isInvalidated).toBe(false)
})
it('removes deleted detail and movie caches while invalidating lists', async () => {
  const client = cache()
  client.setQueryData(collectionOptions(7, 4).queryKey, collection)
  client.setQueryData(collectionMoviesOptions(7, 4, 1).queryKey, { data: [], meta: { page: 1, per_page: 20, total_results: 0, total_pages: 0, metadata_unavailable: false } })
  client.setQueryData(collectionsOptions(7, 1).queryKey, pageOf([collection]))
  await synchronizeCollections(client, 7, { action: 'delete', id: 4 }, null)
  expect(client.getQueryData(collectionOptions(7, 4).queryKey)).toBeUndefined()
  expect(client.getQueryData(collectionMoviesOptions(7, 4, 1).queryKey)).toBeUndefined()
  expect(client.getQueryState(collectionsOptions(7, 1).queryKey)?.isInvalidated).toBe(true)
})
it('ignores stale-account completion and never changes the new account cache', async () => {
  const client = cache()
  client.setQueryData(authKey, { ...user, id: 8 })
  client.setQueryData(collectionsOptions(8, 1, 550).queryKey, pageOf([{ ...collection, contains_movie: false }]))
  expect(await synchronizeCollections(client, 7, { action: 'membership', id: 4, tmdbId: 550, add: true }, null)).toBe(false)
  expect(client.getQueryState(collectionsOptions(8, 1, 550).queryKey)?.isInvalidated).toBe(false)
  expect(client.getQueryData<CollectionsResponse>(collectionsOptions(8, 1, 550).queryKey)?.data[0].contains_movie).toBe(false)
})
