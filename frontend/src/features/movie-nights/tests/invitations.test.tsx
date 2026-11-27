import { renderToStaticMarkup } from 'react-dom/server'
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import { MovieNightParticipants } from '../components/MovieNightParticipants'
import { MovieNightRsvp } from '../components/MovieNightRsvp'
import { nightKeys, requestContext } from '../hooks/cache'
import { nightMutationOptions, nightOptions } from '../hooks/useMovieNights'
import { invitationSearch } from '../lib/invitationSearch'
import { nightPermissions } from '../lib/permissions'
import type { MovieNight, Rsvp } from '../types/movieNight.types'
const host = { id: 7, username: 'host', email: 'fake@example.test', email_verified_at: '2026-01-01', avatar_url: null }
const night: MovieNight = { id: 12, title: 'Together', host, starts_at: '2030-07-16T18:00:00Z', timezone: 'Asia/Beirut', my_rsvp: 'accepted', status: 'scheduled', location: 'SECRET', meeting_url: null, voting_open: true, finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
function setup(owner = 7, status = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  client.setQueryData(authKey, { ...host, id: owner }); client.setQueryData(accessKey(owner), { role: 'user', account_status: status }); requestContext(client, owner)
  return client
}
function render(node: React.ReactNode, client: QueryClient) { return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => vi.restoreAllMocks())
it.each([' AbC_12 ', 'abc', 'a'.repeat(30)])('normalizes valid username prefix %s', input => {
  expect(invitationSearch(input)).toEqual({ query: input.trim().toLowerCase(), valid: true })
})
it.each(['', 'ab', 'a'.repeat(31), 'a-b', 'ábc', 'foo bar', 'abc@'])('rejects unsupported username prefix %s', input => {
  expect(invitationSearch(input).valid).toBe(false)
  expect(nightOptions(setup(), 7, { kind: 'eligibleUsers', id: 12, query: input }).enabled).toBe(false)
})
it('keeps search pages and prefixes isolated when an older response arrives last', async () => {
  const client = setup(), older = deferred<{ data: unknown }>()
  vi.spyOn(api, 'get').mockImplementation((_url, config) => (config?.params as { query?: string } | undefined)?.query === 'old' ? older.promise : Promise.resolve({ data: { data: [{ id: 9, username: 'new', avatar_url: null }], meta: {} } }))
  const old = nightOptions(client, 7, { kind: 'eligibleUsers', id: 12, query: 'old', page: { page: 1 } })
  const next = nightOptions(client, 7, { kind: 'eligibleUsers', id: 12, query: 'new', page: { page: 2 } })
  const pending = client.fetchQuery({ ...old, gcTime: Infinity })
  await client.fetchQuery({ ...next, gcTime: Infinity })
  older.resolve({ data: { data: [{ id: 8, username: 'old', avatar_url: null }], meta: {} } }); await pending
  expect(client.getQueryData(next.queryKey)?.data[0]?.username).toBe('new')
  expect(next.queryKey).not.toEqual(old.queryKey)
})
it('refreshes only the invited event roster/search after an authoritative invitation response', async () => {
  const client = setup()
  const descriptors = [{ kind: 'roster', id: 12 }, { kind: 'eligibleUsers', id: 12, query: 'guest' }, { kind: 'detail', id: 13 }] as const
  for (const descriptor of descriptors) client.setQueryData([...nightOptions(client, 7, descriptor).queryKey], { data: [] })
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 20, participant: { id: 9, username: 'guest', avatar_url: null }, rsvp_status: 'pending', responded_at: null } } })
  await nightMutationOptions(client, 7).mutationFn({ kind: 'invite', id: 12, invitedUserId: 9 })
  expect(post).toHaveBeenCalledWith('/api/v1/me/movie-nights/12/invitations', { invited_user_id: 9 }, expect.anything())
  for (const descriptor of descriptors) expect(client.getQueryState(nightOptions(client, 7, descriptor).queryKey)?.isInvalidated).toBe(descriptor.id === 12)
})
it.each(['pending', 'accepted', 'declined'] as Rsvp[])('renders roster RSVP %s and response information without private account fields', status => {
  const client = setup()
  client.setQueryData(nightOptions(client, 7, { kind: 'roster', id: 12, page: { page: 1, per_page: 12 } }).queryKey, { data: [{ id: 99, participant: { id: 9, username: 'guest', avatar_url: null }, rsvp_status: status, responded_at: '2026-11-01T10:00:00Z' }], meta: { page: 1, per_page: 12, total_pages: 2, total_results: 13 } })
  const html = render(<MovieNightParticipants night={night} roster invite />, client)
  expect(html).toContain('@guest'); expect(html).toContain(status[0].toUpperCase() + status.slice(1)); expect(html).toContain('Responded'); expect(html).toContain('Host'); expect(html).not.toContain('fake@example.test'); expect(html).not.toContain('SECRET')
})
it('does not construct a roster query for an accepted non-host', () => {
  const client = setup(9)
  expect(render(<MovieNightParticipants night={night} roster={false} invite={false} />, client)).toContain('managed by the host')
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(9, 12) })).toHaveLength(0)
})
it.each(['pending', 'declined', 'accepted'] as const)('renders only supported actions for %s', status => {
  const html = render(<MovieNightRsvp night={{ ...night, my_rsvp: status }} />, setup(9))
  expect(html.includes('Accept invitation')).toBe(status !== 'accepted')
  expect(html.includes('Decline invitation')).toBe(status === 'pending')
  expect(html.includes('Change to declined')).toBe(status === 'accepted')
  expect(html).not.toContain('SECRET')
})
it.each(['restricted', 'banned', 'deactivated'])('hides RSVP actions for %s accounts', status => {
  expect(render(<MovieNightRsvp night={night} />, setup(9, status))).toBe('')
})
it.each(['cancelled', 'finalized'] as const)('keeps %s participant reads and disables invitation/RSVP writes', status => {
  const event = { ...night, status }
  const access = { role: 'user' as const, account_status: 'active' as const }
  expect(nightPermissions(host, access, event).roster).toBe(true)
  expect(nightPermissions(host, access, event).invite).toBe(false)
  expect(render(<MovieNightRsvp night={event} />, setup(9))).toBe('')
})
it('RSVP command resolves despite observer reset, then acceptance retrieves fresh authorized details', async () => {
  const client = setup(9), observer = new MutationObserver(client, nightMutationOptions(client, 9))
  const callback = vi.fn(), stop = observer.subscribe(() => {})
  client.setQueryData([...nightKeys.event(9, 12), { kind: 'detail', id: 12 }], { location: 'OLD' })
  vi.spyOn(api, 'get').mockImplementation(path => Promise.resolve(path === '/sanctum/csrf-cookie' ? {} : { data: { data: { ...night, location: 'FRESH' } } }))
  vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { id: 99, rsvp_status: 'accepted' } } })
  expect(await observer.mutate({ kind: 'rsvp', id: 12, status: 'accepted' }, { onSuccess: callback })).toMatchObject({ rsvp_status: 'accepted' })
  expect(observer.getCurrentResult().data).toBeUndefined(); expect(callback).not.toHaveBeenCalled()
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(9, 12) })).toHaveLength(0)
  expect((await client.fetchQuery(nightOptions(client, 9, { kind: 'detail', id: 12 }))).location).toBe('FRESH'); stop()
})
it.each([409, 422, 500])('failed RSVP %s retains membership/private data and never retries', async status => {
  const client = setup(9), key = nightOptions(client, 9, { kind: 'detail', id: 12 }).queryKey
  client.setQueryData(key, night)
  vi.spyOn(api, 'get').mockResolvedValue({}); const put = vi.spyOn(api, 'put').mockRejectedValue({ isAxiosError: true, response: { status } })
  await expect(nightMutationOptions(client, 9).mutationFn({ kind: 'rsvp', id: 12, status: 'declined' })).rejects.toBeDefined()
  expect(client.getQueryData(key)).toEqual(night); expect(put).toHaveBeenCalledTimes(1)
})
it.each(['logout', 'switch'] as const)('rejects a delayed RSVP after %s without restoring private state', async action => {
  const client = setup(9), response = deferred<{ data: unknown }>()
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'put').mockReturnValue(response.promise)
  const observer = new MutationObserver(client, nightMutationOptions(client, 9)), stop = observer.subscribe(() => {})
  const result = observer.mutate({ kind: 'rsvp', id: 12, status: 'accepted' }).catch(error => error)
  await vi.waitFor(() => expect(api.put).toHaveBeenCalled())
  client.setQueryData(authKey, action === 'logout' ? null : host)
  response.resolve({ data: { data: { rsvp_status: 'accepted' } } })
  expect((await result).message).toContain('account or event access changed'); expect(observer.getCurrentResult().data).toBeUndefined(); stop()
})
it('a decline removes every private projection and rejects a late detail without invalidating another event', async () => {
  const client = setup(9), late = deferred<{ data: unknown }>(), other = requestContext(client, 9, 13)
  vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({}) : late.promise)
  const read = client.fetchQuery(nightOptions(client, 9, { kind: 'detail', id: 12 })).catch(error => error)
  for (const kind of ['roster', 'shortlist', 'votes']) client.setQueryData([...nightKeys.event(9, 12), kind], { secret: true })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { rsvp_status: 'declined' } } })
  await nightMutationOptions(client, 9).mutationFn({ kind: 'rsvp', id: 12, status: 'declined' })
  late.resolve({ data: { data: night } }); await read
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(9, 12) })).toHaveLength(0); expect(other.isCurrent()).toBe(true)
})
it('does not submit an invitation if the account changes during CSRF initialization', async () => {
  const client = setup(), csrf = deferred<unknown>()
  vi.spyOn(api, 'get').mockReturnValue(csrf.promise); const post = vi.spyOn(api, 'post')
  const pending = nightMutationOptions(client, 7).mutationFn({ kind: 'invite', id: 12, invitedUserId: 9 }).catch(error => error)
  client.setQueryData(authKey, { ...host, id: 10 }); csrf.resolve({})
  expect((await pending).message).toContain('account or event access changed'); expect(post).not.toHaveBeenCalled()
})
it.each(['pending', 'declined'] as const)('allows advisory %s RSVP before the boundary, closes it exactly at start and never promotes private access', status => {
  const event = { ...night, my_rsvp: status }, guest = { ...host, id: 9 }, access = { role: 'user' as const, account_status: 'active' as const }
  expect(nightPermissions(guest, access, event, Date.parse(event.starts_at) - 1).rsvp).toBe(true)
  expect(nightPermissions(guest, access, event, Date.parse(event.starts_at)).rsvp).toBe(false)
  expect(nightPermissions(guest, access, event).privateRead).toBe(false)
})
it('eligible search and roster retries use fresh authoritative queries after recoverable errors', async () => {
  const client = setup(), page = { data: [], meta: { page: 2, per_page: 12, total_pages: 2, total_results: 13 } }
  const get = vi.spyOn(api, 'get').mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } }).mockResolvedValue({ data: page })
  const options = nightOptions(client, 7, { kind: 'eligibleUsers', id: 12, query: 'guest', page: { page: 2, per_page: 12 } })
  await expect(client.fetchQuery(options)).rejects.toBeDefined()
  expect(await client.fetchQuery(options)).toEqual(page)
  expect(get).toHaveBeenLastCalledWith('/api/v1/me/movie-nights/12/eligible-users', expect.objectContaining({ params: { page: 2, per_page: 12, query: 'guest' }, signal: expect.any(AbortSignal) }))
  await expect(client.fetchQuery(nightOptions(client, 7, { kind: 'roster', id: 12, page: { page: 2, per_page: 12 } }))).resolves.toEqual(page)
})
it.each(['accepted', 'declined'] as const)('marks %s receipt before synchronous observer reset and private cache removal', async status => {
  const client = setup(9), receipt = { current: { confirmed: false } }
  const observer = new MutationObserver(client, nightMutationOptions(client, 9, receipt)), resets: boolean[] = []
  const stop = observer.subscribe(result => { if (result.isIdle) resets.push(receipt.current.confirmed) })
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { rsvp_status: status } } })
  await expect(observer.mutate({ kind: 'rsvp', id: 12, status })).resolves.toMatchObject({ rsvp_status: status })
  expect(receipt.current.confirmed).toBe(true); expect(resets).toEqual([true]); stop()
})
it('does not mark a failed or session-revoked RSVP as an intentional purge', async () => {
  const client = setup(9), receipt = { current: { confirmed: false } }
  vi.spyOn(api, 'get').mockResolvedValue({}); const put = vi.spyOn(api, 'put').mockRejectedValue({ isAxiosError: true, response: { status: 500 } })
  await expect(nightMutationOptions(client, 9, receipt).mutationFn({ kind: 'rsvp', id: 12, status: 'accepted' })).rejects.toBeDefined()
  expect(receipt.current.confirmed).toBe(false)
  const late = deferred<{ data: unknown }>(); put.mockReturnValue(late.promise)
  const result = nightMutationOptions(client, 9, receipt).mutationFn({ kind: 'rsvp', id: 12, status: 'accepted' }).catch(error => error)
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2)); client.setQueryData(authKey, null)
  late.resolve({ data: { data: { rsvp_status: 'accepted' } } }); await result
  expect(receipt.current.confirmed).toBe(false)
})
