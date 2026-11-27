import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey, storeAuthenticatedUser } from '../../auth/hooks/useAuth'
import { applyNightLifecycle, guardedRequest, nightKeys, purgeNight, requestContext } from '../hooks/cache'
import { nightMutationOptions, nightOptions } from '../hooks/useMovieNights'
import type { NightMutation } from '../hooks/useMovieNights'
import { nightPermissions } from '../lib/permissions'
import { asTmdbId, type MovieNight } from '../types/movieNight.types'

const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
const fields = { title: 'Night', starts_at: '2027-07-16T18:00:00Z', timezone: 'Asia/Beirut' }
const scheduled: MovieNight = {
  ...fields, id: 12, host: { id: 7, username: user.username, avatar_url: null }, status: 'scheduled', my_rsvp: 'accepted',
  voting_open: true, finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, created_at: '', updated_at: '',
  location: 'Private hall', meeting_url: 'https://example.test/private-room',
}
const root = '/api/v1/me/movie-nights'
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(authKey, user)
  requestContext(client, user.id)
  return client
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const detailOptions = (client: QueryClient, id = 12, owner = 7) => ({ ...nightOptions(client, owner, { kind: 'detail', id }), gcTime: Infinity })
function closed(status: 'cancelled' | 'finalized'): MovieNight {
  return { ...scheduled, status, voting_open: false, updated_at: '2027-01-02T18:00:00Z',
    cancelled_at: status === 'cancelled' ? '2027-01-02T18:00:00Z' : null,
    finalized_at: status === 'finalized' ? '2027-01-02T18:00:00Z' : null,
    finalized_tmdb_id: status === 'finalized' ? asTmdbId(550) : null }
}
const transition = (kind: 'cancel' | 'finalize'): NightMutation => kind === 'cancel' ? { kind, id: 12 } : { kind, id: 12, confirmed: true }
beforeEach(() => vi.restoreAllMocks())

it('separates event access, list/inbox and create contexts from unrelated event requests', () => {
  const client = setup()
  const aRead = requestContext(client, 7, 12, undefined, 'read')
  const aWrite = requestContext(client, 7, 12)
  const bRead = requestContext(client, 7, 13, undefined, 'read')
  const bWrite = requestContext(client, 7, 13)
  const create = requestContext(client, 7)
  const list = requestContext(client, 7, undefined, undefined, 'list')
  const inbox = requestContext(client, 7, undefined, undefined, 'inbox')
  purgeNight(client, 7, 12)
  for (const context of [aRead, aWrite, list, inbox]) expect(context.isCurrent()).toBe(false)
  for (const context of [bRead, bWrite, create]) expect(context.isCurrent()).toBe(true)
})
it('rejects late mixed list/inbox and event A results while event B completes normally', async () => {
  const client = setup()
  const pending = new Map([root, `${root}/invitations`, `${root}/12`, `${root}/13`].map(path => [path, deferred<{ data: unknown }>()]))
  vi.spyOn(api, 'get').mockImplementation(path => pending.get(String(path))!.promise)
  const requests = [
    client.fetchQuery(nightOptions(client, 7, { kind: 'list' })).catch(error => error),
    client.fetchQuery(nightOptions(client, 7, { kind: 'received' })).catch(error => error),
    client.fetchQuery(detailOptions(client)).catch(error => error),
    client.fetchQuery(detailOptions(client, 13)),
  ]
  purgeNight(client, 7, 12)
  pending.get(root)!.resolve({ data: { data: [scheduled] } })
  pending.get(`${root}/invitations`)!.resolve({ data: { data: [{ movie_night: scheduled }] } })
  pending.get(`${root}/12`)!.resolve({ data: { data: scheduled } })
  const b = { ...scheduled, id: 13 }
  pending.get(`${root}/13`)!.resolve({ data: { data: b } })
  const results = await Promise.all(requests)
  expect(results[3]).toEqual(b)
  expect(client.getQueryData(detailOptions(client, 13).queryKey)).toEqual(b)
  for (const key of [nightKeys.event(7, 12), nightKeys.lists(7), nightKeys.inbox(7)]) expect(client.getQueryCache().findAll({ queryKey: key })).toHaveLength(0)
})
it.each(['decline', 'denied-read'] as const)('%s for A preserves a concurrent successful server mutation for B and its observer', async revoke => {
  const client = setup()
  const response = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'patch').mockImplementation(() => response.promise)
  const observer = new MutationObserver(client, nightMutationOptions(client, 7))
  const unsubscribe = observer.subscribe(() => {})
  const result = observer.mutate({ kind: 'update', id: 13, fields: { title: 'Edited B' } })
  await vi.waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
  if (revoke === 'decline') {
    vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { rsvp_status: 'declined' } } })
    await nightMutationOptions(client, 7).mutationFn({ kind: 'rsvp', id: 12, status: 'declined' })
  } else {
    await expect(guardedRequest(client, 7, 12, async () => { throw { isAxiosError: true, response: { status: 404 } } })).rejects.toBeDefined()
  }
  expect(observer.getCurrentResult().isPending).toBe(true)
  const b = { ...scheduled, id: 13, title: 'Edited B' }
  response.resolve({ data: { data: b } })
  await expect(result).resolves.toEqual(b)
  expect(observer.getCurrentResult().data).toEqual(b)
  expect(observer.getCurrentResult().isSuccess).toBe(true)
  unsubscribe()
})
it('an unrelated purge does not invalidate a concurrent create that has no event ID yet', async () => {
  const client = setup()
  const response = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockImplementation(() => response.promise)
  const result = nightMutationOptions(client, 7).mutationFn({ kind: 'create', fields })
  await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  purgeNight(client, 7, 12)
  response.resolve({ data: { data: { ...scheduled, id: 14 } } })
  await expect(result).resolves.toMatchObject({ id: 14 })
})
it.each(['logout', 'switch', 'account-revocation'] as const)('%s still invalidates every active request scope', action => {
  const client = setup()
  const contexts = [requestContext(client, 7, 12), requestContext(client, 7, 13, undefined, 'read'), requestContext(client, 7),
    requestContext(client, 7, undefined, undefined, 'list'), requestContext(client, 7, undefined, undefined, 'inbox')]
  if (action === 'logout') client.setQueryData(authKey, null)
  else if (action === 'switch') client.setQueryData(authKey, { ...user, id: 8 })
  else client.setQueryData(['me', 7, 'access'], { role: 'user', account_status: 'banned' })
  expect(contexts.every(context => !context.isCurrent())).toBe(true)
})

it.each(['cancel', 'finalize'] as const)('%s immediately caches the authoritative terminal state and closes permission hints', async kind => {
  const client = setup()
  const options = detailOptions(client)
  client.setQueryData(options.queryKey, scheduled)
  const observer = new QueryObserver(client, { ...options, enabled: false })
  const unsubscribe = observer.subscribe(() => {})
  const night = closed(kind === 'cancel' ? 'cancelled' : 'finalized')
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: night } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await expect(nightMutationOptions(client, 7).mutationFn(transition(kind))).resolves.toEqual(night)
  expect(client.getQueryData(options.queryKey)).toEqual(night)
  expect(observer.getCurrentResult().data).toEqual(night)
  const permissions = nightPermissions(user, { role: 'user', account_status: 'active' }, observer.getCurrentResult().data, Date.parse(scheduled.starts_at) - 1)
  for (const name of ['edit', 'invite', 'cancel', 'finalize', 'rsvp', 'nominate', 'vote'] as const) expect(permissions[name]).toBe(false)
  expect(invalidate).toHaveBeenCalledWith({ queryKey: nightKeys.lists(7) })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: nightKeys.inbox(7) })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: nightKeys.event(7, 12), predicate: expect.any(Function) })
  if (kind === 'finalize') {
    expect(post).toHaveBeenCalledWith(`${root}/12/finalize`, {}, { signal: undefined })
    expect(client.getQueryData(options.queryKey)?.finalized_tmdb_id).toBe(550)
  }
  unsubscribe()
})
it.each(['cancel', 'finalize'] as const)('%s rejects stale reads and preserves both the authoritative detail and a concurrent B write', async kind => {
  const client = setup()
  const options = detailOptions(client)
  client.setQueryData(options.queryKey, scheduled)
  const oldDetail = deferred<{ data: { data: MovieNight } }>()
  const bResponse = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockImplementation(path => String(path) === `${root}/12` ? oldDetail.promise : Promise.resolve({}))
  vi.spyOn(api, 'patch').mockImplementation(() => bResponse.promise)
  const night = closed(kind === 'cancel' ? 'cancelled' : 'finalized')
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: night } })
  const staleRead = client.fetchQuery(options).catch(error => error)
  const bWrite = nightMutationOptions(client, 7).mutationFn({ kind: 'update', id: 13, fields: { title: 'B' } })
  await vi.waitFor(() => expect(api.patch).toHaveBeenCalled())
  await nightMutationOptions(client, 7).mutationFn(transition(kind))
  expect(client.getQueryData(options.queryKey)).toEqual(night)
  oldDetail.resolve({ data: { data: scheduled } })
  bResponse.resolve({ data: { data: { ...scheduled, id: 13, title: 'B' } } })
  await staleRead
  await expect(bWrite).resolves.toMatchObject({ id: 13, title: 'B' })
  expect(client.getQueryData(options.queryKey)).toEqual(night)
})
it('lifecycle read revisions reject uncancellable A reads but keep A writes and B reads current', async () => {
  const client = setup()
  const response = deferred<MovieNight>()
  const oldRead = guardedRequest(client, 7, 12, () => response.promise, undefined, 'read').catch(error => error)
  const aWrite = requestContext(client, 7, 12)
  const bRead = requestContext(client, 7, 13, undefined, 'read')
  const create = requestContext(client, 7)
  const list = requestContext(client, 7, undefined, undefined, 'list')
  const inbox = requestContext(client, 7, undefined, undefined, 'inbox')
  applyNightLifecycle(client, 7, 12, closed('finalized'))
  response.resolve(scheduled)
  expect((await oldRead).message).toContain('account or event access changed')
  expect(list.isCurrent()).toBe(false); expect(inbox.isCurrent()).toBe(false)
  for (const context of [aWrite, bRead, create]) expect(context.isCurrent()).toBe(true)
})
it('refreshes mounted list, inbox and vote observers from server responses after cancellation', async () => {
  const client = setup()
  const night = closed('cancelled')
  const details = detailOptions(client)
  client.setQueryData(details.queryKey, scheduled)
  const list = { ...nightOptions(client, 7, { kind: 'list' }), staleTime: Infinity }
  const inbox = { ...nightOptions(client, 7, { kind: 'received' }), staleTime: Infinity }
  const votes = { ...nightOptions(client, 7, { kind: 'votes', id: 12 }), staleTime: Infinity }
  const listResponse = { data: [night], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1 } }
  const inboxResponse = { data: [{ id: 1, participant: scheduled.host, rsvp_status: 'accepted' as const, responded_at: null, movie_night: night }], meta: listResponse.meta }
  const voteResponse = { totals: [], my_vote: null, total_votes: 0, leaders: [], voting_open: false }
  client.setQueryData(list.queryKey, { ...listResponse, data: [scheduled] })
  client.setQueryData(inbox.queryKey, { ...inboxResponse, data: [{ ...inboxResponse.data[0], movie_night: scheduled }] })
  client.setQueryData(votes.queryKey, { ...voteResponse, voting_open: true })
  const listObserver = new QueryObserver(client, list)
  const inboxObserver = new QueryObserver(client, inbox)
  const votesObserver = new QueryObserver(client, votes)
  const stop = [listObserver.subscribe(() => {}), inboxObserver.subscribe(() => {}), votesObserver.subscribe(() => {})]
  const get = vi.spyOn(api, 'get').mockImplementation(async path => ({ data: String(path) === root ? listResponse : String(path) === `${root}/invitations` ? inboxResponse : { data: voteResponse } }))
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: night } })
  await nightMutationOptions(client, 7).mutationFn({ kind: 'cancel', id: 12 })
  await vi.waitFor(() => {
    expect(listObserver.getCurrentResult().data).toEqual(listResponse)
    expect(inboxObserver.getCurrentResult().data).toEqual(inboxResponse)
    expect(votesObserver.getCurrentResult().data).toEqual(voteResponse)
  })
  expect(get).toHaveBeenCalledTimes(4) // CSRF plus exactly the three affected active query families.
  stop.forEach(unsubscribe => unsubscribe())
})
it.each(['owner-changed', 'membership-revoked'] as const)('does not apply a lifecycle response when %s while the write is pending', async reason => {
  const client = setup()
  const options = detailOptions(client)
  client.setQueryData(options.queryKey, scheduled)
  const response = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockImplementation(() => response.promise)
  const result = nightMutationOptions(client, 7).mutationFn({ kind: 'cancel', id: 12 }).catch(error => error)
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
  if (reason === 'owner-changed') await storeAuthenticatedUser(client, { ...user, id: 8 })
  else purgeNight(client, 7, 12)
  response.resolve({ data: { data: closed('cancelled') } })
  expect((await result).message).toContain('account or event access changed')
  expect(client.getQueryData(options.queryKey)).toBeUndefined()
})
it('never seeds missing/private detail caches or touches another owner from a lifecycle response', () => {
  const client = setup()
  const other = detailOptions(client, 12, 8)
  client.setQueryData(other.queryKey, { ...scheduled, location: 'Other owner' })
  applyNightLifecycle(client, 7, 12, closed('finalized'))
  expect(client.getQueryData(other.queryKey)?.location).toBe('Other owner')
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
  const mine = detailOptions(client)
  client.setQueryData([...mine.queryKey], { ...scheduled, my_rsvp: 'declined', location: undefined })
  applyNightLifecycle(client, 7, 12, closed('finalized'))
  expect(client.getQueryData(mine.queryKey)?.location).toBeUndefined()
})

it('reproduces installed React Query behavior: raw cache removal retains mounted mutation results', async () => {
  const client = new QueryClient()
  const observer = new MutationObserver(client, { mutationKey: ['control'], mutationFn: async () => ({ location: 'private' }) })
  const stop = observer.subscribe(() => {})
  await observer.mutate()
  const mutation = client.getMutationCache().find({ mutationKey: ['control'] })!
  client.getMutationCache().remove(mutation)
  expect(observer.getCurrentResult().data).toEqual({ location: 'private' })
  observer.reset(); stop()
})
it.each(['logout', 'switch', 'account-revocation', 'event-revocation', 'denied-read', 'record-removal'] as const)('%s clears completed mounted Movie Night mutation data, variables and errors immediately', async action => {
  const client = setup()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: scheduled } })
  const observer = new MutationObserver(client, nightMutationOptions(client, 7))
  const listener = vi.fn()
  const stop = observer.subscribe(listener)
  await observer.mutate({ kind: 'create', fields })
  expect(observer.getCurrentResult().data).toEqual(scheduled)
  if (action === 'logout') client.setQueryData(authKey, null)
  else if (action === 'switch') client.setQueryData(authKey, { ...user, id: 8 })
  else if (action === 'account-revocation') client.setQueryData(['me', 7, 'access'], { role: 'user', account_status: 'banned' })
  else if (action === 'event-revocation') purgeNight(client, 7, 12)
  else if (action === 'denied-read') await expect(guardedRequest(client, 7, 12, async () => { throw { isAxiosError: true, response: { status: 404 } } })).rejects.toBeDefined()
  else client.getMutationCache().remove(client.getMutationCache().find({ mutationKey: nightKeys.owner(7) })!)
  expect(observer.getCurrentResult()).toMatchObject({ status: 'idle', data: undefined, variables: undefined, error: null })
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ data: undefined, status: 'idle' }))
  expect(client.getMutationCache().findAll({ mutationKey: nightKeys.owner(7) })).toHaveLength(0)
  stop()
})
it.each(['logout', 'switch', 'event-revocation'] as const)('%s detaches pending mutation observers so late responses and callbacks cannot restore private data', async action => {
  const client = setup()
  const response = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockImplementation(() => response.promise)
  const observer = new MutationObserver(client, nightMutationOptions(client, 7))
  const stop = observer.subscribe(() => {})
  const onSuccess = vi.fn()
  const result = observer.mutate({ kind: 'cancel', id: 12 }, { onSuccess }).catch(error => error)
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
  if (action === 'logout') client.setQueryData(authKey, null)
  else if (action === 'switch') client.setQueryData(authKey, { ...user, id: 8 })
  else purgeNight(client, 7, 12)
  expect(observer.getCurrentResult().isIdle).toBe(true)
  response.resolve({ data: { data: closed('cancelled') } })
  expect((await result).message).toContain('account or event access changed')
  expect(observer.getCurrentResult()).toMatchObject({ status: 'idle', data: undefined, variables: undefined, error: null })
  expect(onSuccess).not.toHaveBeenCalled()
  stop()
})
it('only resets A mutation observers on A access revocation; completed B results remain available', async () => {
  const client = setup()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'patch').mockImplementation(async path => ({ data: { data: { ...scheduled, id: String(path).endsWith('/13') ? 13 : 12 } } }))
  const a = new MutationObserver(client, nightMutationOptions(client, 7))
  const b = new MutationObserver(client, nightMutationOptions(client, 7))
  const stops = [a.subscribe(() => {}), b.subscribe(() => {})]
  await a.mutate({ kind: 'update', id: 12, fields: { title: 'A' } })
  await b.mutate({ kind: 'update', id: 13, fields: { title: 'B' } })
  purgeNight(client, 7, 12)
  expect(a.getCurrentResult().data).toBeUndefined()
  expect(b.getCurrentResult().data).toMatchObject({ id: 13 })
  expect(b.getCurrentResult().isSuccess).toBe(true)
  stops.forEach(stop => stop())
})
it('does not reset unrelated feature mutation observers', async () => {
  const client = setup()
  const observer = new MutationObserver(client, { mutationKey: ['another-feature', 7], mutationFn: async () => ({ saved: true }) })
  const stop = observer.subscribe(() => {})
  await observer.mutate()
  purgeNight(client, 7, 12)
  client.setQueryData(authKey, null)
  expect(observer.getCurrentResult().data).toEqual({ saved: true })
  stop()
})
it('a revoked pending mutation cannot overwrite a newer result on the same mounted observer', async () => {
  const client = setup()
  const response = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'post').mockImplementation(() => response.promise)
  const b = { ...scheduled, id: 13, title: 'B' }
  vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: b } })
  const observer = new MutationObserver(client, nightMutationOptions(client, 7))
  const stop = observer.subscribe(() => {})
  const old = observer.mutate({ kind: 'cancel', id: 12 }).catch(error => error)
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
  purgeNight(client, 7, 12)
  expect(observer.getCurrentResult().isIdle).toBe(true)
  await observer.mutate({ kind: 'update', id: 13, fields: { title: 'B' } })
  response.resolve({ data: { data: closed('cancelled') } })
  expect((await old).message).toContain('account or event access changed')
  expect(observer.getCurrentResult().data).toEqual(b)
  expect(observer.getCurrentResult().isSuccess).toBe(true)
  stop()
})
it.each(['cancel', 'finalize'] as const)('%s prevents old mixed summaries and vote totals from overwriting a refreshed lifecycle', async kind => {
  const client = setup()
  const night = closed(kind === 'cancel' ? 'cancelled' : 'finalized')
  const list = { ...nightOptions(client, 7, { kind: 'list' }), gcTime: Infinity }
  const inbox = { ...nightOptions(client, 7, { kind: 'received' }), gcTime: Infinity }
  const votes = { ...nightOptions(client, 7, { kind: 'votes', id: 12 }), gcTime: Infinity }
  const details = detailOptions(client)
  client.setQueryData(details.queryKey, scheduled)
  const pending = new Map([root, `${root}/invitations`, `${root}/12/votes`].map(path => [path, deferred<{ data: unknown }>()]))
  vi.spyOn(api, 'get').mockImplementation(path => String(path) === '/sanctum/csrf-cookie' ? Promise.resolve({}) : pending.get(String(path))!.promise)
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: night } })
  const old = [client.fetchQuery(list).catch(error => error), client.fetchQuery(inbox).catch(error => error), client.fetchQuery(votes).catch(error => error)]
  await nightMutationOptions(client, 7).mutationFn(transition(kind))
  // Simulate the authoritative refresh completing before the uncancellable old transport returns.
  const metadata = { page: 1, per_page: 20, total_pages: 1, total_results: 1 }
  const newList = { data: [night], meta: metadata }
  const newInbox = { data: [{ id: 1, participant: night.host, rsvp_status: 'accepted' as const, responded_at: null, movie_night: night }], meta: metadata }
  const newVotes = { totals: [], my_vote: null, total_votes: 0, leaders: [], voting_open: false }
  client.setQueryData(list.queryKey, newList)
  client.setQueryData(inbox.queryKey, newInbox)
  client.setQueryData(votes.queryKey, newVotes)
  pending.get(root)!.resolve({ data: { data: [scheduled], meta: metadata } })
  pending.get(`${root}/invitations`)!.resolve({ data: { data: [{ ...newInbox.data[0], movie_night: scheduled }], meta: metadata } })
  pending.get(`${root}/12/votes`)!.resolve({ data: { data: { ...newVotes, voting_open: true } } })
  await Promise.all(old)
  expect(client.getQueryData(list.queryKey)).toEqual(newList)
  expect(client.getQueryData(inbox.queryKey)).toEqual(newInbox)
  expect(client.getQueryData(votes.queryKey)).toEqual(newVotes)
  expect(client.getQueryData(details.queryKey)).toEqual(night)
})
it('event revocation clears authoritative tie leaders retained in a mounted mutation error', async () => {
  const client = setup()
  vi.spyOn(api, 'get').mockResolvedValue({})
  const failure = { isAxiosError: true, response: { status: 409, data: { code: 'MOVIE_NIGHT_TIE', leaders: [550, 551] } } }
  vi.spyOn(api, 'post').mockRejectedValue(failure)
  const observer = new MutationObserver(client, nightMutationOptions(client, 7))
  const stop = observer.subscribe(() => {})
  await expect(observer.mutate({ kind: 'finalize', id: 12, confirmed: true })).rejects.toBe(failure)
  expect(observer.getCurrentResult().error).toBe(failure)
  purgeNight(client, 7, 12)
  expect(observer.getCurrentResult()).toMatchObject({ status: 'idle', data: undefined, variables: undefined, error: null })
  stop()
})
