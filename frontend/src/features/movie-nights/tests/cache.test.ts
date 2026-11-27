import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey, isPrivateSessionQuery, storeAuthenticatedUser } from '../../auth/hooks/useAuth'
import { guardedRequest, nightKeys, purgeNight, requestContext } from '../hooks/cache'
import { nightMutationOptions, nightOptions } from '../hooks/useMovieNights'
import type { NightMutation } from '../hooks/useMovieNights'
import { asTmdbId } from '../types/movieNight.types'
const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(authKey, user)
  requestContext(client, 7)
  return client
}
function seed(client: QueryClient) {
  for (const key of [nightKeys.event(7, 12), nightKeys.lists(7), nightKeys.inbox(7), nightKeys.event(8, 12)]) client.setQueryData(key, { private: true })
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => vi.restoreAllMocks())
it('isolates owners, event IDs, list status, pages and received invitations', () => {
  const client = setup()
  const requests = [nightOptions(client, 7, { kind: 'list' }), nightOptions(client, 8, { kind: 'list' }), nightOptions(client, 7, { kind: 'list', filters: { status: 'cancelled' } }), nightOptions(client, 7, { kind: 'list', filters: { page: 2 } }), nightOptions(client, 7, { kind: 'received' }), nightOptions(client, 7, { kind: 'detail', id: 12 }), nightOptions(client, 7, { kind: 'detail', id: 13 })]
  expect(new Set(requests.map(option => JSON.stringify(option.queryKey))).size).toBe(7)
  expect(requests[1].enabled).toBe(false)
  expect(isPrivateSessionQuery({ queryKey: nightKeys.owner(7) })).toBe(true)
})
it('disables invalid event/lookup requests and unverified or absent sessions', () => {
  const client = setup()
  expect(nightOptions(client, 7, { kind: 'detail', id: 0 }).enabled).toBe(false)
  expect(nightOptions(client, 7, { kind: 'eligibleUsers', id: 12, query: 'ab' }).enabled).toBe(false)
  client.setQueryData(authKey, { ...user, email_verified_at: null })
  expect(nightOptions(client, 7, { kind: 'list' }).enabled).toBe(false)
  client.setQueryData(authKey, null)
  expect(nightOptions(client, 7, { kind: 'list' }).enabled).toBe(false)
})
it.each(['accepted', 'declined'] as const)('RSVP %s discards all prior private event and membership projections without touching another owner', async status => {
  const client = setup(); seed(client)
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { rsvp_status: status } } })
  await nightMutationOptions(client, 7).mutationFn({ kind: 'rsvp', id: 12, status })
  for (const key of [nightKeys.event(7, 12), nightKeys.lists(7), nightKeys.inbox(7)]) expect(client.getQueryData(key)).toBeUndefined()
  expect(client.getQueryData(nightKeys.event(8, 12))).toEqual({ private: true })
})
it.each([401, 403, 404])('denied private read %s immediately removes cached details, shortlist, votes, roster and rich summaries', async status => {
  const client = setup(); seed(client)
  for (const kind of ['detail', 'votes', 'shortlist', 'roster']) client.setQueryData([...nightKeys.event(7, 12), kind], { private: true })
  await expect(guardedRequest(client, 7, 12, async () => { throw { isAxiosError: true, response: { status } } })).rejects.toBeDefined()
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
  expect(client.getQueryData(nightKeys.lists(7))).toBeUndefined()
})
it('prevents late uncancellable event and mixed-list responses from restoring revoked data', async () => {
  const client = setup()
  const detail = deferred<{ data: { data: { location: string } } }>()
  const listing = deferred<{ data: { data: unknown[] } }>()
  vi.spyOn(api, 'get').mockImplementation(path => path === '/api/v1/me/movie-nights' ? listing.promise : detail.promise)
  const event = client.fetchQuery(nightOptions(client, 7, { kind: 'detail', id: 12 })).catch(error => error)
  const list = client.fetchQuery(nightOptions(client, 7, { kind: 'list' })).catch(error => error)
  purgeNight(client, 7, 12)
  detail.resolve({ data: { data: { location: 'private' } } }); listing.resolve({ data: { data: [] } })
  await Promise.all([event, list])
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.owner(7) })).toHaveLength(0)
})
it('rejects a late mutation response after decline and removes private mutation cache records', async () => {
  const client = setup()
  const late = deferred<{ data: { data: { location: string } } }>()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockImplementation(() => late.promise)
  const mutation = client.getMutationCache().build(client, nightMutationOptions(client, 7))
  const result = mutation.execute({ kind: 'cancel', id: 12 }).catch(error => error)
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
  purgeNight(client, 7, 12)
  late.resolve({ data: { data: { location: 'private' } } })
  expect((await result).message).toContain('account or event access changed')
  expect(client.getMutationCache().findAll({ mutationKey: nightKeys.owner(7) })).toHaveLength(0)
})
it.each(['logout', 'switch', 'same-owner-return'] as const)('invalidates contexts and removes private caches on %s', async action => {
  const client = setup(); seed(client)
  const context = requestContext(client, 7, 12)
  if (action === 'switch') await storeAuthenticatedUser(client, { ...user, id: 8 })
  else { client.setQueryData(authKey, null); if (action === 'same-owner-return') client.setQueryData(authKey, user) }
  expect(context.isCurrent()).toBe(false)
  expect(client.getQueryCache().findAll({ queryKey: ['movie-nights'] })).toHaveLength(0)
})
it('cannot send an old-account mutation after CSRF resolves under a different account', async () => {
  const client = setup()
  const csrf = deferred<unknown>()
  vi.spyOn(api, 'get').mockImplementation(() => csrf.promise)
  const post = vi.spyOn(api, 'post')
  const result = nightMutationOptions(client, 7).mutationFn({ kind: 'cancel', id: 12 }).catch(error => error)
  client.setQueryData(authKey, { ...user, id: 8 }); csrf.resolve({})
  expect((await result).message).toContain('account or event access changed')
  expect(post).not.toHaveBeenCalled()
})
it.each(['tie', 'stale'] as const)('%s finalization refreshes authoritative state without retrying or selecting a replacement', async kind => {
  const client = setup()
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockRejectedValue({ isAxiosError: true, response: kind === 'tie' ? { status: 409, data: { code: 'MOVIE_NIGHT_TIE', leaders: [550, 551] } } : { status: 422, data: { errors: { tmdb_id: ['Choose a highest-voted movie.'] } } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const options = nightMutationOptions(client, 7)
  await expect(options.mutationFn({ kind: 'finalize', id: 12, confirmed: true, tmdbId: asTmdbId(550) })).rejects.toBeDefined()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: nightKeys.event(7, 12) })
  expect(post).toHaveBeenCalledTimes(1); expect(options.retry).toBe(false)
})
it('requires explicit irreversible finalization confirmation at runtime', async () => {
  const client = setup(); const post = vi.spyOn(api, 'post')
  await expect(nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12 } as NightMutation)).rejects.toThrow('Confirm irreversible')
  expect(post).not.toHaveBeenCalled()
})
it.each(['banned', 'deactivated'] as const)('removes idle private queries and invalidates request guards when access becomes %s', account_status => {
  const client = setup(); seed(client)
  const context = requestContext(client, 7, 12)
  client.setQueryData(['me', 7, 'access'], { role: 'user', account_status })
  expect(context.isCurrent()).toBe(false)
  expect(client.getQueryCache().findAll({ queryKey: ['movie-nights'] })).toHaveLength(0)
  expect(nightOptions(client, 7, { kind: 'detail', id: 12 }).enabled).toBe(false)
})
it('preserves read compatibility for restricted verified accounts', () => {
  const client = setup()
  client.setQueryData(['me', 7, 'access'], { role: 'user', account_status: 'restricted' })
  expect(nightOptions(client, 7, { kind: 'detail', id: 12 }).enabled).toBe(true)
})
it('rejects late raw responses even without React Query transport cancellation', async () => {
  const client = setup()
  const response = deferred<{ location: string }>()
  const result = guardedRequest(client, 7, 12, () => response.promise).catch(error => error)
  purgeNight(client, 7, 12)
  response.resolve({ location: 'private' })
  expect((await result).message).toContain('account or event access changed')
})
it('a failed RSVP retains current access and never optimistically removes the vote', async () => {
  const client = setup(); seed(client)
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'put').mockRejectedValue({ isAxiosError: true, response: { status: 409 } })
  await expect(nightMutationOptions(client, 7).mutationFn({ kind: 'rsvp', id: 12, status: 'declined' })).rejects.toBeDefined()
  expect(client.getQueryData(nightKeys.event(7, 12))).toEqual({ private: true })
})
it('keeps concrete result types for each query descriptor', () => {
  const client = setup()
  const detail = nightOptions(client, 7, { kind: 'detail', id: 12 })
  const totals = nightOptions(client, 7, { kind: 'votes', id: 12 })
  const verifyTypes = async () => {
    const event = await client.fetchQuery(detail)
    const tally = await client.fetchQuery(totals)
    const location: string | null = event.location
    const count: number = tally.total_votes
    const cachedLocation: string | null | undefined = client.getQueryData(detail.queryKey)?.location
    void cachedLocation
    // @ts-expect-error Vote totals have no private location field.
    void tally.location
    // @ts-expect-error Detail has no client-calculated vote total.
    void event.total_votes
    return [location, count]
  }
  expect(verifyTypes).toBeTypeOf('function')
})

it('clears mounted query observers as well as cache records when private access is revoked', () => {
  const client = setup()
  const options = nightOptions(client, 7, { kind: 'detail', id: 12 }, false)
  client.setQueryData([...options.queryKey], { location: 'private' })
  const observer = new QueryObserver(client, options)
  const unsubscribe = observer.subscribe(() => {})
  expect(observer.getCurrentResult().data).toEqual({ location: 'private' })
  purgeNight(client, 7, 12)
  expect(observer.getCurrentResult().data).toBeUndefined()
  unsubscribe()
})
