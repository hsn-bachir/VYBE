import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import { applyNightLifecycle, applyNightUpdate, nightKeys, purgeNight, requestContext } from '../hooks/cache'
import { nightMutationOptions, nightOptions } from '../hooks/useMovieNights'
import type { MovieNight } from '../types/movieNight.types'

const user = { id: 7, username: 'host', email: 'host@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
const night: MovieNight = { id: 12, title: 'Initial', host: user, starts_at: '2030-07-16T18:00:00Z', timezone: 'Asia/Beirut', location: 'Private hall', meeting_url: null, status: 'scheduled', my_rsvp: 'accepted', finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, voting_open: true, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }
const a = { ...night, title: 'Write A' }, b = { ...night, title: 'Write B' }
const detail = '/api/v1/me/movie-nights/12'
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(authKey, user)
  client.setQueryData(accessKey(7), { role: 'user', account_status: 'active' })
  const options = { ...nightOptions(client, 7, { kind: 'detail', id: 12 }), gcTime: Infinity, staleTime: Infinity }
  client.getQueryCache().build<MovieNight, Error, MovieNight, readonly unknown[]>(client, options).setData(night)
  return { client, options, mutate: nightMutationOptions(client, 7).mutationFn }
}
function writes() {
  const first = deferred<{ data: { data: MovieNight } }>(), second = deferred<{ data: { data: MovieNight } }>()
  const patch = vi.spyOn(api, 'patch').mockImplementation((_path, body) => (body as { title: string }).title === 'Write A' ? first.promise : second.promise)
  return { first, second, patch }
}
const response = (data: MovieNight) => ({ data: { data } })
beforeEach(() => vi.restoreAllMocks())

it.each([
  ['A-first', 'A'], ['B-first', 'A'], ['A-first', 'B'], ['B-first', 'B'],
] as const)('reconciles equal-timestamp edits arriving %s using server %s, never dispatch/arrival ordering', async (order, final) => {
  const { client, options, mutate } = setup(), pending = writes()
  const authoritative = final === 'A' ? a : b
  const get = vi.spyOn(api, 'get').mockImplementation(async path => String(path) === detail ? response(authoritative) : {})
  const observer = new QueryObserver(client, options), seen: string[] = []
  const stop = observer.subscribe(result => { if (result.data) seen.push(result.data.title) })
  const first = mutate({ kind: 'update', id: 12, fields: { title: a.title } })
  const second = mutate({ kind: 'update', id: 12, fields: { title: b.title } })
  await vi.waitFor(() => expect(pending.patch).toHaveBeenCalledTimes(2))
  if (order === 'A-first') {
    pending.first.resolve(response(a)); await expect(first).resolves.toEqual(a)
    await vi.waitFor(() => expect(client.getQueryData(options.queryKey)).toEqual(authoritative))
    pending.second.resolve(response(b)); await expect(second).resolves.toEqual(b)
  } else {
    pending.second.resolve(response(b)); await expect(second).resolves.toEqual(b)
    await vi.waitFor(() => expect(client.getQueryData(options.queryKey)).toEqual(authoritative))
    pending.first.resolve(response(a)); await expect(first).resolves.toEqual(a)
  }
  await vi.waitFor(() => expect(get.mock.calls.filter(([path]) => String(path) === detail)).toHaveLength(2))
  await vi.waitFor(() => expect(client.getQueryData(options.queryKey)).toEqual(authoritative))
  expect(seen).not.toContain(final === 'A' ? b.title : a.title)
  expect(a.updated_at).toBe(b.updated_at)
  stop()
})
it('applies a single uncontended equal-timestamp edit without an unnecessary reconciliation read', async () => {
  const { client, options, mutate } = setup()
  const get = vi.spyOn(api, 'get').mockResolvedValue({})
  vi.spyOn(api, 'patch').mockResolvedValue(response(a))
  await expect(mutate({ kind: 'update', id: 12, fields: { title: a.title } })).resolves.toEqual(a)
  expect(client.getQueryData(options.queryKey)).toEqual(a)
  expect(get).toHaveBeenCalledExactlyOnceWith('/sanctum/csrf-cookie', { signal: undefined })
})
it('reconciles rather than replacing a detail refreshed while an edit was in flight', async () => {
  const { client, options, mutate } = setup()
  const write = deferred<ReturnType<typeof response>>()
  vi.spyOn(api, 'get').mockImplementation(async path => String(path) === detail ? response(b) : {})
  const patch = vi.spyOn(api, 'patch').mockImplementation(() => write.promise)
  const result = mutate({ kind: 'update', id: 12, fields: { title: a.title } })
  await vi.waitFor(() => expect(patch).toHaveBeenCalled())
  await client.fetchQuery({ ...options, staleTime: 0 })
  expect(client.getQueryData(options.queryKey)).toEqual(b)
  write.resolve(response(a)); await expect(result).resolves.toEqual(a)
  await vi.waitFor(() => expect(client.getQueryData(options.queryKey)).toEqual(b))
})
it('cancels an older reconciliation when a later successful response requires a fresh read', async () => {
  const { client, options, mutate } = setup(), pending = writes()
  const oldRead = deferred<ReturnType<typeof response>>(), latestRead = deferred<ReturnType<typeof response>>()
  let reads = 0
  vi.spyOn(api, 'get').mockImplementation(path => String(path) !== detail ? Promise.resolve({}) : ++reads === 1 ? oldRead.promise : latestRead.promise)
  const first = mutate({ kind: 'update', id: 12, fields: { title: a.title } })
  const second = mutate({ kind: 'update', id: 12, fields: { title: b.title } })
  await vi.waitFor(() => expect(pending.patch).toHaveBeenCalledTimes(2))
  pending.second.resolve(response(b)); await second
  await vi.waitFor(() => expect(reads).toBe(1))
  pending.first.resolve(response(a)); await first
  await vi.waitFor(() => expect(reads).toBe(2))
  latestRead.resolve(response(b)); await vi.waitFor(() => expect(client.getQueryData(options.queryKey)).toEqual(b))
  oldRead.resolve(response(a)); await Promise.resolve()
  expect(client.getQueryData(options.queryKey)).toEqual(b)
})
it.each(['revoke', 'switch'] as const)('does not restore private data when %s occurs during reconciliation', async reason => {
  const { client, options } = setup()
  const read = deferred<ReturnType<typeof response>>()
  vi.spyOn(api, 'get').mockImplementation(() => read.promise)
  applyNightUpdate(client, 7, 12, a) // Missing dispatch provenance is ambiguous too.
  if (reason === 'revoke') purgeNight(client, 7, 12)
  else client.setQueryData(authKey, { ...user, id: 8 })
  read.resolve(response(a)); await Promise.resolve()
  expect(client.getQueryData(options.queryKey)).toBeUndefined()
})
it('keeps terminal state when an older scheduled reconciliation finishes late', async () => {
  const { client, options } = setup(), read = deferred<ReturnType<typeof response>>()
  vi.spyOn(api, 'get').mockImplementation(() => read.promise)
  applyNightUpdate(client, 7, 12, a)
  const cancelled: MovieNight = { ...night, status: 'cancelled', voting_open: false }
  applyNightLifecycle(client, 7, 12, cancelled)
  read.resolve(response(a)); await Promise.resolve()
  expect(client.getQueryData(options.queryKey)).toEqual(cancelled)
})
it('reconciliation failure stays a query error while both confirmed mutations remain successful', async () => {
  const { client, options, mutate } = setup(), pending = writes()
  let outage = true
  const get = vi.spyOn(api, 'get').mockImplementation(async path => {
    if (String(path) !== detail) return {}
    if (outage) throw { isAxiosError: true, response: { status: 503 } }
    return response(b)
  })
  const first = mutate({ kind: 'update', id: 12, fields: { title: a.title } })
  const second = mutate({ kind: 'update', id: 12, fields: { title: b.title } })
  await vi.waitFor(() => expect(pending.patch).toHaveBeenCalledTimes(2))
  pending.first.resolve(response(a)); await expect(first).resolves.toEqual(a)
  await vi.waitFor(() => expect(client.getQueryState(options.queryKey)?.status).toBe('error'))
  pending.second.resolve(response(b)); await expect(second).resolves.toEqual(b)
  await vi.waitFor(() => expect(get.mock.calls.filter(([path]) => String(path) === detail)).toHaveLength(2))
  expect(client.getQueryData(options.queryKey)).toEqual(night)
  outage = false
  await client.refetchQueries({ queryKey: options.queryKey })
  expect(client.getQueryData(options.queryKey)).toEqual(b)
  expect(pending.patch).toHaveBeenCalledTimes(2)
})
it('failed edit attempts are released and cannot mark future independent edits as competing', async () => {
  const { client, options, mutate } = setup()
  const get = vi.spyOn(api, 'get').mockResolvedValue({})
  const patch = vi.spyOn(api, 'patch').mockRejectedValueOnce({ isAxiosError: true, response: { status: 422, data: { errors: { title: ['Invalid title.'] } } } }).mockResolvedValueOnce(response(b))
  await expect(mutate({ kind: 'update', id: 12, fields: { title: a.title } })).rejects.toBeDefined()
  await expect(mutate({ kind: 'update', id: 12, fields: { title: b.title } })).resolves.toEqual(b)
  expect(client.getQueryData(options.queryKey)).toEqual(b)
  expect(get.mock.calls.some(([path]) => String(path) === detail)).toBe(false)
  expect(patch).toHaveBeenCalledTimes(2)
})
it('reconciliation and revocation for A preserve unrelated B requests and successful edits', async () => {
  const { client, mutate } = setup()
  const other = { ...nightOptions(client, 7, { kind: 'detail', id: 13 }), gcTime: Infinity, staleTime: Infinity }
  const otherNight = { ...night, id: 13 }
  client.getQueryCache().build<MovieNight, Error, MovieNight, readonly unknown[]>(client, other).setData(otherNight)
  const otherContext = requestContext(client, 7, 13)
  const read = deferred<ReturnType<typeof response>>()
  vi.spyOn(api, 'get').mockImplementation(path => String(path) === detail ? read.promise : Promise.resolve({}))
  vi.spyOn(api, 'patch').mockResolvedValue(response({ ...otherNight, title: 'Unrelated successful B' }))
  applyNightUpdate(client, 7, 12, a)
  purgeNight(client, 7, 12)
  expect(otherContext.isCurrent()).toBe(true)
  await expect(mutate({ kind: 'update', id: 13, fields: { title: 'Unrelated successful B' } })).resolves.toMatchObject({ id: 13 })
  expect(client.getQueryData(other.queryKey)?.title).toBe('Unrelated successful B')
  read.resolve(response(a)); await Promise.resolve()
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
})
