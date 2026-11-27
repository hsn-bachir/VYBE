import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import { MovieNightShortlist } from '../components/MovieNightShortlist'
import { applyNightLifecycle, nightKeys, purgeNight, reconcileNightContent, requestContext } from '../hooks/cache'
import { nightMutationOptions, nightOptions, type NightMutation } from '../hooks/useMovieNights'
import { canRemoveCandidate, nightPermissions } from '../lib/permissions'
import { asCandidateId, asTmdbId, type Candidate, type MovieNight, type ShortlistPage, type VoteTotals } from '../types/movieNight.types'
const user = { id: 7, username: 'host', email: 'fake@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
const night: MovieNight = { id: 12, title: 'A shared story', host: user, my_rsvp: 'accepted', starts_at: '2030-07-16T18:00:00Z', timezone: 'Asia/Beirut', status: 'scheduled', voting_open: true, location: 'PRIVATE', meeting_url: null, finalized_at: null, finalized_tmdb_id: null, cancelled_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const candidate: Candidate = { id: asCandidateId(42), tmdb_id: asTmdbId(550), movie: { tmdb_id: 550, title: 'A film worth sharing', poster_path: null, backdrop_path: null, overview: 'A story', release_date: '1999-10-15', tmdb_rating: 8.4, tmdb_vote_count: 100 }, nominated_by: user, created_at: '2026-01-01T00:00:00Z' }
const shortlist: ShortlistPage = { data: [candidate], meta: { page: 1, per_page: 12, total_pages: 2, total_results: 13, metadata_unavailable: false } }
const totals: VoteTotals = { totals: [{ tmdb_id: candidate.tmdb_id, movie_night_movie_id: candidate.id, votes: 0 }], my_vote: null, total_votes: 0, leaders: [], voting_open: true }
const action = (kind: 'nominate' | 'remove' | 'vote', id = 12): NightMutation => kind === 'nominate' ? { kind, id, tmdbId: candidate.tmdb_id } : { kind, id, candidateId: candidate.id }
function setup(owner = 7, status = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(authKey, { ...user, id: owner }); client.setQueryData(accessKey(owner), { role: 'user', account_status: status })
  requestContext(client, owner)
  return client
}
function seed(client: QueryClient, owner = 7, entries = shortlist, votes = totals) {
  client.setQueryData(nightOptions(client, owner, { kind: 'shortlist', id: 12, page: { page: 1, per_page: 12 } }).queryKey, entries)
  client.setQueryData(nightOptions(client, owner, { kind: 'votes', id: 12 }).queryKey, votes)
}
function render(client: QueryClient, event = night) { return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><MovieNightShortlist night={event} /></MemoryRouter></QueryClientProvider>) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => vi.restoreAllMocks())
it.each([7, 9])('renders authorized shortlist and server pagination for member %s', owner => {
  const client = setup(owner); seed(client, owner)
  const html = render(client)
  for (const text of ['Shared shortlist', 'Voting', 'A film worth sharing', '1999', 'Nominated by', '0 votes', 'No votes yet', 'Next', 'Nominate a movie']) expect(html).toContain(text)
  expect(html).not.toContain('fake@example.test'); expect(html).not.toContain('finalized winner:')
})
it.each(['pending', 'declined'] as const)('never executes private queries for %s users', rsvp => {
  const client = setup(9)
  expect(render(client, { ...night, my_rsvp: rsvp } as unknown as MovieNight)).toBe('')
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(9, 12) })).toHaveLength(2)
  // Disabled descriptors may exist, but never execute private HTTP or contain private data.
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(9, 12) }).every(query => query.state.fetchStatus === 'idle' && query.state.data === undefined)).toBe(true)
})
it.each(['restricted', 'cancelled', 'finalized', 'started'] as const)('retains authorized %s reads with no mutation controls', state => {
  const client = setup(7, state === 'restricted' ? 'restricted' : 'active'); seed(client)
  const event = { ...night, ...(state === 'cancelled' || state === 'finalized' ? { status: state, voting_open: false } : {}), ...(state === 'started' ? { starts_at: '2020-01-01T00:00:00Z' } : {}) }
  const html = render(client, event)
  expect(html).toContain(candidate.movie!.title); expect(html).not.toContain('Nominate a movie'); expect(html).not.toContain('Vote for movie'); expect(html).not.toContain('>Remove<')
})
it('keeps missing metadata candidates voteable using stable Core IDs and a poster/TMDB fallback', () => {
  const client = setup(); seed(client, 7, { ...shortlist, data: [{ ...candidate, movie: null }], meta: { ...shortlist.meta, metadata_unavailable: true } })
  const html = render(client)
  for (const value of ['TMDB #550', 'Poster unavailable', 'Vote for movie', 'data-candidate-id="42"', 'metadata is unavailable']) expect(html).toContain(value)
})
it('uses server totals/leaders across pages and Core my_vote without inferring a local winner', () => {
  const client = setup(); seed(client, 7, shortlist, { ...totals, total_votes: 9, my_vote: candidate.id, leaders: [candidate.tmdb_id, asTmdbId(551)], totals: [{ ...totals.totals[0]!, votes: 4 }] })
  const html = render(client)
  expect(html).toContain('<strong>9</strong> total valid votes'); expect(html).toContain('Tied leaders'); expect(html).toContain('TMDB #551'); expect(html).toContain('aria-pressed="true"'); expect(html).toContain('✓ Your vote'); expect(html).not.toContain('Confirm finalization')
})
it('uses the server candidate count for the 50 limit instead of the partial page length', () => {
  const client = setup(); seed(client, 7, { ...shortlist, meta: { ...shortlist.meta, total_results: 50 } })
  expect(render(client)).toContain('50-movie limit')
  expect(render(client)).toMatch(/<button[^>]*disabled=""[^>]*>Nominate a movie/)
})
it('does not allow removal with missing totals or nonzero votes', () => {
  const access = { role: 'user' as const, account_status: 'active' as const }
  expect(canRemoveCandidate(user, access, night, candidate, undefined)).toBe(false)
  expect(canRemoveCandidate(user, access, night, candidate, { ...totals, totals: [] })).toBe(false)
  expect(canRemoveCandidate(user, access, night, candidate, { ...totals, totals: [{ ...totals.totals[0]!, votes: 1 }] })).toBe(false)
})
it.each([['host', 7, 9, true], ['own', 9, 9, true], ['other', 9, 10, false]] as const)('checks %s candidate removal ownership using Core identity', (_kind, actor, nominator, allowed) => {
  expect(canRemoveCandidate({ ...user, id: actor }, { role: 'user', account_status: 'active' }, night, { ...candidate, nominated_by: { ...user, id: nominator } }, totals)).toBe(allowed)
})
it.each([-1, 0, 1])('uses the exact deadline with offset %s ms', offset => {
  const p = nightPermissions(user, { role: 'user', account_status: 'active' }, night, Date.parse(night.starts_at) + offset)
  expect(p.nominate).toBe(offset < 0); expect(p.vote).toBe(offset < 0)
})
it.each(['nominate', 'remove', 'vote'] as const)('%s success invalidates only shortlist/votes and keeps detail/roster/unrelated reads and writes current', async kind => {
  const client = setup(); seed(client)
  const before = requestContext(client, 7, 12, undefined, 'content'), detail = requestContext(client, 7, 12, undefined, 'read'), write = requestContext(client, 7, 12), other = requestContext(client, 7, 13, undefined, 'content')
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'post').mockResolvedValue({ data: { data: candidate } }); vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { movie_night_movie_id: candidate.id, updated_at: night.updated_at } } }); vi.spyOn(api, 'delete').mockResolvedValue({})
  await nightMutationOptions(client, 7).mutationFn(action(kind))
  expect(before.isCurrent()).toBe(false); expect(detail.isCurrent()).toBe(true); expect(write.isCurrent()).toBe(true); expect(other.isCurrent()).toBe(true)
  expect(client.getQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)?.my_vote).toBeNull()
  expect(client.getQueryState(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)?.isInvalidated).toBe(true)
})
it('leaves valid membership/private data intact on MOVIE_NOT_FOUND nomination errors', async () => {
  const client = setup(); seed(client)
  const boundary = requestContext(client, 7, 12)
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'post').mockRejectedValue({ isAxiosError: true, response: { status: 404, data: { code: 'MOVIE_NOT_FOUND' } } })
  await expect(nightMutationOptions(client, 7).mutationFn(action('nominate'))).rejects.toBeDefined()
  expect(boundary.isCurrent()).toBe(true); expect(client.getQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)).toEqual(totals)
  expect(api.get).toHaveBeenCalledTimes(1)
})
it.each([403, 404])('candidate-specific %s verifies private access without revoking a valid member', async status => {
  const client = setup(); seed(client); const boundary = requestContext(client, 7, 12)
  vi.spyOn(api, 'get').mockImplementation(path => Promise.resolve(path === '/sanctum/csrf-cookie' ? {} : { data: { data: night } }))
  vi.spyOn(api, 'delete').mockRejectedValue({ isAxiosError: true, response: { status } })
  await expect(nightMutationOptions(client, 7).mutationFn(action('remove'))).rejects.toBeDefined()
  expect(boundary.isCurrent()).toBe(true); expect(api.get).toHaveBeenCalledWith('/api/v1/me/movie-nights/12', expect.anything())
})
it.each([401, 403, 404])('actual private-read denial %s during candidate reconciliation purges all affected private data', async status => {
  const client = setup(); seed(client)
  vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({}) : Promise.reject({ isAxiosError: true, response: { status } }))
  vi.spyOn(api, 'delete').mockRejectedValue({ isAxiosError: true, response: { status: 404 } })
  await expect(nightMutationOptions(client, 7).mutationFn(action('remove'))).rejects.toBeDefined()
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
})
it.each([409, 422, 503])('failed vote %s keeps the last confirmed selection without retrying', async status => {
  const client = setup(); seed(client, 7, shortlist, { ...totals, my_vote: candidate.id })
  vi.spyOn(api, 'get').mockResolvedValue({}); const put = vi.spyOn(api, 'put').mockRejectedValue({ isAxiosError: true, response: { status } })
  await expect(nightMutationOptions(client, 7).mutationFn({ kind: 'vote', id: 12, candidateId: asCandidateId(43) })).rejects.toBeDefined()
  expect(client.getQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)?.my_vote).toBe(candidate.id); expect(put).toHaveBeenCalledTimes(1)
})
it.each(['votes', 'shortlist'] as const)('rejects ignored-AbortSignal old %s reads after content reconciliation', async kind => {
  const client = setup(), late = deferred<{ data: unknown }>()
  vi.spyOn(api, 'get').mockReturnValue(late.promise)
  const options = nightOptions(client, 7, { kind, id: 12 }), pending = client.fetchQuery(options).catch(error => error)
  reconcileNightContent(client, 7, 12)
  late.resolve({ data: kind === 'votes' ? { data: totals } : shortlist }); await pending
  expect(client.getQueryData(options.queryKey)).toBeUndefined()
})
it.each(['logout', 'switch', 'decline'] as const)('removes private shortlist and vote data and rejects late writes after %s', async change => {
  const client = setup(); seed(client); const late = deferred<{ data: unknown }>()
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'put').mockReturnValue(late.promise)
  const result = nightMutationOptions(client, 7).mutationFn(action('vote')).catch(error => error)
  await vi.waitFor(() => expect(api.put).toHaveBeenCalled())
  if (change === 'decline') purgeNight(client, 7, 12)
  else client.setQueryData(authKey, change === 'logout' ? null : { ...user, id: 9 })
  late.resolve({ data: { data: { movie_night_movie_id: candidate.id, updated_at: night.updated_at } } }); expect((await result).message).toContain('account or event access changed')
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
})
it('lifecycle transitions also invalidate outstanding content contexts without changing unrelated events', () => {
  const client = setup(), old = requestContext(client, 7, 12, undefined, 'content'), other = requestContext(client, 7, 13, undefined, 'content')
  applyNightLifecycle(client, 7, 12, { ...night, status: 'cancelled' })
  expect(old.isCurrent()).toBe(false); expect(other.isCurrent()).toBe(true)
})
it.each(['first-last', 'second-last'] as const)('reconciles competing equal-timestamp vote responses %s via fresh server totals, never a payload merge', async order => {
  const client = setup(); const options = { ...nightOptions(client, 7, { kind: 'votes', id: 12 }), gcTime: Infinity }
  client.getQueryCache().build<VoteTotals, Error, VoteTotals, readonly unknown[]>(client, options).setData(totals)
  const first = deferred<{ data: unknown }>(), second = deferred<{ data: unknown }>(), fresh = { ...totals, my_vote: asCandidateId(43), total_votes: 2, leaders: [asTmdbId(551)] }
  vi.spyOn(api, 'get').mockImplementation(path => Promise.resolve(path === '/sanctum/csrf-cookie' ? {} : { data: { data: fresh } }))
  vi.spyOn(api, 'put').mockImplementation((_path, body) => (body as { movie_night_movie_id: number }).movie_night_movie_id === 42 ? first.promise : second.promise)
  const observer = new QueryObserver(client, options), stop = observer.subscribe(() => {})
  const mutate = nightMutationOptions(client, 7).mutationFn, a = mutate(action('vote')), b = mutate({ kind: 'vote', id: 12, candidateId: asCandidateId(43) })
  await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
  const value = (id: number) => ({ data: { data: { movie_night_movie_id: id, updated_at: night.updated_at } } })
  if (order === 'first-last') { second.resolve(value(43)); await b; first.resolve(value(42)) }
  else { first.resolve(value(42)); await a; second.resolve(value(43)) }
  await Promise.all([a,b]); await vi.waitFor(() => expect(observer.getCurrentResult().data?.my_vote).toBe(43)); stop()
})
it.each(['nominate', 'remove'] as const)('concurrent %s and vote successes never invalidate each other and refetch both projections', async kind => {
  const client = setup(); seed(client)
  const later = deferred<{ data: unknown }>()
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'put').mockReturnValue(later.promise)
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: candidate } }); vi.spyOn(api, 'delete').mockResolvedValue({})
  const mutate = nightMutationOptions(client, 7).mutationFn
  const vote = mutate(action('vote')); await vi.waitFor(() => expect(api.put).toHaveBeenCalled())
  await mutate(action(kind)); later.resolve({ data: { data: { movie_night_movie_id: candidate.id, updated_at: night.updated_at } } })
  await expect(vote).resolves.toMatchObject({ movie_night_movie_id: candidate.id })
  expect(client.getQueryState(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)?.isInvalidated).toBe(true)
})
it('a post-decline reacceptance requests fresh shortlist/votes without restoring a previous selection', async () => {
  const client = setup(9); seed(client, 9, shortlist, { ...totals, my_vote: candidate.id, total_votes: 1 })
  vi.spyOn(api, 'get').mockResolvedValue({}); const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { rsvp_status: 'declined' } } })
  const mutate = nightMutationOptions(client, 9).mutationFn
  await mutate({ kind: 'rsvp', id: 12, status: 'declined' })
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(9, 12) })).toHaveLength(0)
  put.mockResolvedValue({ data: { data: { rsvp_status: 'accepted' } } })
  await mutate({ kind: 'rsvp', id: 12, status: 'accepted' })
  vi.spyOn(api, 'get').mockImplementation(path => Promise.resolve(path.endsWith('/votes') ? { data: { data: totals } } : { data: shortlist }))
  expect((await client.fetchQuery(nightOptions(client, 9, { kind: 'votes', id: 12 }))).my_vote).toBeNull()
  expect((await client.fetchQuery(nightOptions(client, 9, { kind: 'shortlist', id: 12 }))).data[0]?.id).toBe(candidate.id)
})
it('unknown movie errors remain safe and cannot invalidate an unrelated pending detail request', async () => {
  const client = setup(), other = requestContext(client, 7, 13, undefined, 'read')
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'post').mockRejectedValue({ isAxiosError: true, response: { status: 404, data: { code: 'MOVIE_NOT_FOUND' } } })
  await expect(nightMutationOptions(client, 7).mutationFn(action('nominate'))).rejects.toBeDefined()
  expect(other.isCurrent()).toBe(true)
})
it('refreshes current account access after a forbidden candidate write without touching other owners', async () => {
  const client = setup(); client.setQueryData(accessKey(9), { role: 'user', account_status: 'active' })
  vi.spyOn(api, 'get').mockImplementation(path => Promise.resolve(path === '/sanctum/csrf-cookie' ? {} : { data: { data: night } }))
  vi.spyOn(api, 'delete').mockRejectedValue({ isAxiosError: true, response: { status: 403 } })
  await expect(nightMutationOptions(client, 7).mutationFn(action('remove'))).rejects.toBeDefined()
  expect(client.getQueryState(accessKey(7))?.isInvalidated).toBe(true)
  expect(client.getQueryState(accessKey(9))?.isInvalidated).toBe(false)
})
it.each([
  { offset: -1, status: 'scheduled', account: 'active', serverOpen: true, detailOpen: true, expected: true },
  { offset: 0, status: 'scheduled', account: 'active', serverOpen: true, detailOpen: true, expected: false },
  { offset: 1, status: 'scheduled', account: 'active', serverOpen: true, detailOpen: true, expected: false },
  { offset: -1, status: 'cancelled', account: 'active', serverOpen: true, detailOpen: true, expected: false },
  { offset: -1, status: 'finalized', account: 'active', serverOpen: true, detailOpen: true, expected: false },
  { offset: -1, status: 'scheduled', account: 'restricted', serverOpen: true, detailOpen: true, expected: true },
  { offset: -1, status: 'scheduled', account: 'active', serverOpen: false, detailOpen: true, expected: false },
  { offset: -1, status: 'scheduled', account: 'restricted', serverOpen: false, detailOpen: true, expected: false },
  { offset: -1, status: 'scheduled', account: 'active', serverOpen: true, detailOpen: false, expected: false },
] as const)('renders voting state for cached totals: %j', ({ offset, status, account, serverOpen, detailOpen, expected }) => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(night.starts_at) + offset)
  const client = setup(7, account)
  const snapshot = { ...totals, my_vote: candidate.id, total_votes: 4, leaders: [candidate.tmdb_id, asTmdbId(551)], voting_open: serverOpen, totals: [{ ...totals.totals[0]!, votes: 2 }] }
  seed(client, 7, shortlist, snapshot)
  const html = render(client, { ...night, status, voting_open: detailOpen })
  expect(html).toContain(expected ? 'Voting open' : 'Voting closed')
  expect(html).not.toContain(expected ? 'Voting closed' : 'Voting open')
  expect(html).toContain('<strong>4</strong> total valid votes')
  expect(html).toContain('Your vote: A film worth sharing'); expect(html).toContain('Tied leaders: A film worth sharing · TMDB #551')
  expect(client.getQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)).toEqual(snapshot)
})
function seedProbeIsolation(client: QueryClient) {
  seed(client)
  client.setQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey, night)
  client.setQueryData([...nightKeys.event(7, 12), { kind: 'roster' }], { data: [{ private: 'A roster' }] })
  client.setQueryData(nightKeys.lists(7), { data: [{ private: 'A summary' }] })
  client.setQueryData(nightKeys.inbox(7), { data: [{ private: 'A inbox' }] })
  client.setQueryData(nightKeys.event(7, 13), { private: 'Unrelated event B' })
  client.setQueryData(nightKeys.event(9, 13), { private: 'Unrelated owner' })
  client.setQueryData(accessKey(9), { role: 'user', account_status: 'active' })
}
const probeError = (kind: '503' | 'network' | 'denied') => kind === 'network' ? { isAxiosError: true, message: 'Network unavailable' }
  : { isAxiosError: true, response: { status: kind === '503' ? 503 : 404 } }
it.each([403, 404])('candidate %s with an unverifiable private probe removes private A data but isolates B and another owner', async status => {
  for (const kind of ['503', 'network'] as const) {
    const client = setup(); seedProbeIsolation(client)
    const other = requestContext(client, 7, 13)
    vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({}) : Promise.reject(probeError(kind)))
    const denied = { isAxiosError: true, response: { status } }
    const remove = vi.spyOn(api, 'delete').mockRejectedValue(denied)
    const options = nightMutationOptions(client, 7)
    const mutation = client.getMutationCache().build(client, options)
    await expect(mutation.execute(action('remove'))).rejects.toBe(denied)
    expect(options.retry).toBe(false); expect(remove).toHaveBeenCalledTimes(1)
    expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
    expect(client.getQueryData(nightKeys.lists(7))).toBeUndefined(); expect(client.getQueryData(nightKeys.inbox(7))).toBeUndefined()
    expect(client.getMutationCache().findAll({ mutationKey: nightKeys.owner(7) })).toHaveLength(0)
    expect(other.isCurrent()).toBe(true); expect(client.getQueryData(nightKeys.event(7, 13))).toEqual({ private: 'Unrelated event B' })
    expect(client.getQueryData(nightKeys.event(9, 13))).toEqual({ private: 'Unrelated owner' })
    expect(client.getQueryState(accessKey(9))?.isInvalidated).toBe(false)
    vi.restoreAllMocks()
  }
})
it.each((['switch', 'logout', 'same-owner-return', 'event-revocation'] as const).flatMap(change =>
  (['authorized', '503', 'network', 'denied'] as const).map(outcome => ({ change, outcome }))))('late probe $outcome after $change cannot restore A or purge a fresh session', async ({ change, outcome }) => {
  const client = setup(); seedProbeIsolation(client)
  const late = deferred<{ data: { data: MovieNight } }>()
  const get = vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({})
    : late.promise.then(value => { if (outcome !== 'authorized') throw probeError(outcome); return value }))
  const remove = vi.spyOn(api, 'delete').mockRejectedValue({ isAxiosError: true, response: { status: 404 } })
  const pending = client.getMutationCache().build(client, nightMutationOptions(client, 7)).execute(action('remove')).catch(error => error)
  await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/api/v1/me/movie-nights/12', expect.anything()))
  if (change === 'event-revocation') purgeNight(client, 7, 12)
  else if (change === 'switch') client.setQueryData(authKey, { ...user, id: 9 })
  else { client.setQueryData(authKey, null); if (change === 'same-owner-return') client.setQueryData(authKey, user) }
  const freshOwner = change === 'switch' ? 9 : 7
  const freshKey = nightOptions(client, freshOwner, { kind: 'detail', id: 12 }).queryKey
  if (change !== 'logout') {
    client.setQueryData(accessKey(freshOwner), { role: 'user', account_status: 'active' })
    client.setQueryData(freshKey, { ...night, title: 'FRESH authorized snapshot' })
    client.setQueryData(nightKeys.event(freshOwner, 13), { private: 'FRESH unrelated event B' })
  }
  late.resolve({ data: { data: { ...night, title: 'STALE probe response' } } }); await pending
  expect(remove).toHaveBeenCalledTimes(1)
  if (change === 'logout') expect(client.getQueryCache().findAll({ queryKey: ['movie-nights'] })).toHaveLength(0)
  else {
    expect(client.getQueryData(freshKey)?.title).toBe('FRESH authorized snapshot')
    expect(client.getQueryData(nightKeys.event(freshOwner, 13))).toEqual({ private: 'FRESH unrelated event B' })
    if (change === 'switch') expect(client.getQueryCache().findAll({ queryKey: nightKeys.owner(7) })).toHaveLength(0)
  }
  if (change === 'event-revocation') expect(client.getQueryData(nightKeys.event(9, 13))).toEqual({ private: 'Unrelated owner' })
})
it.each(['503', 'network'] as const)('a fresh authorized query recovers after a temporary %s private probe failure without reusing old data', async kind => {
  const client = setup(); seedProbeIsolation(client)
  vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({}) : Promise.reject(probeError(kind)))
  const remove = vi.spyOn(api, 'delete').mockRejectedValue({ isAxiosError: true, response: { status: 404 } })
  await expect(nightMutationOptions(client, 7).mutationFn(action('remove'))).rejects.toBeDefined()
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
  const fresh = { ...night, title: 'Fresh route read' }
  vi.spyOn(api, 'get').mockImplementation(path => Promise.resolve(path.endsWith('/votes') ? { data: { data: totals } } : path.endsWith('/movies') ? { data: shortlist } : { data: { data: fresh } }))
  expect(await client.fetchQuery(nightOptions(client, 7, { kind: 'detail', id: 12 }))).toEqual(fresh)
  expect(await client.fetchQuery(nightOptions(client, 7, { kind: 'votes', id: 12 }))).toEqual(totals)
  expect(await client.fetchQuery(nightOptions(client, 7, { kind: 'shortlist', id: 12 }))).toEqual(shortlist)
  expect(remove).toHaveBeenCalledTimes(1)
})
