import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import { CollectionSaveButton, SaveCollectionAction } from '../components/SaveCollectionAction'
import SaveCollectionDialog from '../components/SaveCollectionDialog'
import * as hooks from '../hooks/useCollections'
import type { Collection, CollectionOperation, CollectionsResponse } from '../types/collection.types'

const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-11-01T00:00:00Z' }
const custom: Collection = { id: 4, name: 'Weekend', description: null, visibility: 'private', movie_count: 1, system_key: null, created_at: null, updated_at: null, contains_movie: true }
const favorite: Collection = { ...custom, id: 1, system_key: 'favorites', name: 'Favorites' }
const page = (data: Collection[], current = 1, pages = 1): CollectionsResponse => ({ data, meta: { page: current, per_page: 20, total_pages: pages, total_results: pages * 20 } })
const clients: QueryClient[] = []
function cache() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(authKey, user)
  client.setQueryData(accessKey(7), { role: 'user', account_status: 'active' })
  clients.push(client)
  return client
}
function render(node: React.ReactNode, client = cache()) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => vi.restoreAllMocks())
afterEach(() => clients.splice(0).forEach(client => client.clear()))

it('shows plus when unsaved and the existing purple active class/check when saved, preserving dialog semantics', () => {
  const button = (selected: boolean, feedback = '') => render(<CollectionSaveButton selected={selected} feedback={feedback} open={false} checking={false} failed={false} onOpen={() => {}} onRetry={() => {}} />)
  const unsaved = button(false)
  expect(unsaved).toContain('＋')
  expect(unsaved).toContain('Save to collection')
  expect(unsaved).not.toContain('is-saved')
  const saved = button(true)
  expect(saved).toContain('membership-button is-saved')
  expect(saved).toContain('m8 12 3 3 5-6')
  expect(saved).toContain('Saved to collection')
  expect(saved).not.toContain('＋')
  for (const html of [unsaved, saved]) {
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('aria-pressed')
  }
  for (const feedback of ['Added to collection.', 'Removed from collection.']) {
    expect(button(true, feedback)).toContain(`<p class="action-feedback" role="status">${feedback}</p>`)
  }
})

it('does not count Favorites and reads later pages without preview requests until a custom match', async () => {
  const client = cache()
  const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: page([favorite], 1, 3) })
    .mockResolvedValueOnce({ data: page([custom], 2, 3) })
  const options = hooks.customCollectionMembershipOptions(client, 7, 550)
  expect(await client.fetchQuery(options)).toBe(true)
  expect(get).toHaveBeenCalledTimes(2)
  expect(get).toHaveBeenLastCalledWith('/api/v1/me/collections', expect.objectContaining({ params: { page: 2, per_page: 20, contains_tmdb_id: 550, include_previews: 0 } }))
  expect(render(<SaveCollectionAction owner={7} movie={550} title="Fixture" />, client)).toContain('Saved to collection')
})

it('checks all required pages before declaring unsaved, including Favorites-only memberships', async () => {
  const client = cache()
  const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: page([favorite], 1, 2) })
    .mockResolvedValueOnce({ data: page([{ ...custom, contains_movie: false }], 2, 2) })
  expect(await client.fetchQuery(hooks.customCollectionMembershipOptions(client, 7, 550))).toBe(false)
  expect(get).toHaveBeenCalledTimes(2)
  expect(render(<SaveCollectionAction owner={7} movie={550} title="Fixture" />, client)).toContain('Save to collection')
})

it('deduplicates the existing in-flight Favorites/dialog page query', async () => {
  const client = cache()
  let finish!: (response: unknown) => void
  const get = vi.spyOn(api, 'get').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const firstPage = client.fetchQuery(hooks.collectionsOptions(7, 1, 550, false))
  const membership = client.fetchQuery(hooks.customCollectionMembershipOptions(client, 7, 550))
  finish({ data: page([favorite, custom]) })
  await firstPage
  expect(await membership).toBe(true)
  expect(get).toHaveBeenCalledTimes(1)
})

it('keeps saved after one removal and restores unsaved after the final custom removal and revalidation', async () => {
  const client = cache()
  let rows = [favorite, custom, { ...custom, id: 5 }]
  vi.spyOn(api, 'get').mockImplementation(async () => ({ data: page(rows) }))
  const options = hooks.customCollectionMembershipOptions(client, 7, 550)
  const observer = new QueryObserver(client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(true))
    rows = rows.map(row => row.id === 4 ? { ...row, contains_movie: false } : row)
    await hooks.synchronizeCollections(client, 7, { action: 'membership', id: 4, tmdbId: 550, add: false }, null)
    await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false))
    expect(observer.getCurrentResult().data).toBe(true)
    rows = rows.map(row => row.id === 5 ? { ...row, contains_movie: false } : row)
    await hooks.synchronizeCollections(client, 7, { action: 'membership', id: 5, tmdbId: 550, add: false }, null)
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(false))
  } finally { unsubscribe() }
})

it('publishes dialog success feedback for custom add/remove and create-and-save, excluding Favorites', () => {
  const client = cache()
  client.setQueryData(hooks.collectionsOptions(7, 1, 550, false).queryKey, page([favorite, custom]))
  const callbacks = new Map<number, (result: Collection | null, operation: CollectionOperation) => void>()
  vi.spyOn(hooks, 'useCollectionMutation').mockImplementation((_owner, confirmed, membership) => {
    if (confirmed && membership) callbacks.set(membership.id, confirmed)
    return { isPending: false, isError: false, error: null, reset: () => {} } as unknown as ReturnType<typeof hooks.useCollectionMutation>
  })
  const confirmed = vi.fn()
  render(<SaveCollectionDialog owner={7} movie={550} title="Fixture" onClose={() => {}} onMembershipConfirmed={confirmed} />, client)
  callbacks.get(1)!(null, { action: 'membership', id: 1, tmdbId: 550, add: true })
  expect(confirmed).not.toHaveBeenCalled()
  callbacks.get(4)!(null, { action: 'membership', id: 4, tmdbId: 550, add: true })
  callbacks.get(4)!(null, { action: 'membership', id: 4, tmdbId: 550, add: false })
  callbacks.get(0)!(null, { action: 'membership', id: 9, tmdbId: 550, add: true })
  expect(confirmed.mock.calls).toEqual([[true], [false], [true]])
})

it('never invokes confirmed feedback for a failed membership request', async () => {
  const client = cache()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockRejectedValue(new Error('Request failed'))
  const confirmed = vi.fn()
  let mutate!: ReturnType<typeof hooks.useCollectionMutation>['mutateAsync']
  function Harness() { mutate = hooks.useCollectionMutation(7, confirmed).mutateAsync; return null }
  render(<Harness />, client)
  await expect(mutate({ action: 'membership', id: 4, tmdbId: 550, add: true })).rejects.toThrow('Request failed')
  expect(confirmed).not.toHaveBeenCalled()
})

it('preserves account isolation and reports incomplete membership reads instead of false success', async () => {
  const client = cache()
  const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: page([favorite], 1, 2) }).mockRejectedValueOnce(new Error('Unavailable'))
  const options = hooks.customCollectionMembershipOptions(client, 7, 550)
  await expect(client.fetchQuery(options)).rejects.toThrow('Unavailable')
  expect(get).toHaveBeenCalledTimes(2)
  expect(client.getQueryData(options.queryKey)).toBeUndefined()
  expect(options.queryKey).not.toEqual(hooks.customCollectionMembershipOptions(client, 8, 550).queryKey)
  expect(options.queryKey).not.toEqual(hooks.customCollectionMembershipOptions(client, 7, 551).queryKey)
  expect(hooks.customCollectionMembershipOptions(client, 0, 550).enabled).toBe(false)
  const html = render(<CollectionSaveButton selected={false} open checking={false} feedback="" failed onOpen={() => {}} onRetry={() => {}} />)
  expect(html).toContain('Collection state unavailable')
  expect(html).toContain('role="alert"')
  expect(html).not.toContain('Added to collection.')
})
