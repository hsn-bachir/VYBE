import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import { detailOptions } from '../../movies/hooks/useMovies'
import { MovieNightFinalization } from '../components/MovieNightFinalization'
import { finalizationAdmission } from '../hooks/finalizationAdmission'
import { acquireNightCommand } from '../hooks/commandExclusion'
import { nightKeys, purgeNight, requestContext } from '../hooks/cache'
import { nightMutationOptions, nightOptions } from '../hooks/useMovieNights'
import { movieNightError } from '../api/errors'
import { asCandidateId, asTmdbId, type Candidate, type MovieNight, type VoteTotals } from '../types/movieNight.types'
const user = { id: 7, username: 'host', avatar_url: null, email: 'fake@example.test', email_verified_at: '2026-01-01T00:00:00Z' }
const night: MovieNight = { id: 12, host: user, title: 'Final screening', starts_at: '2030-07-16T18:00:00Z', timezone: 'Asia/Beirut', status: 'scheduled', my_rsvp: 'accepted', voting_open: true, finalized_at: null, finalized_tmdb_id: null, cancelled_at: null, location: 'PRIVATE', meeting_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const film = { tmdb_id: 550, title: 'The authoritative film', poster_path: null, backdrop_path: null, overview: null, release_date: '1999-01-01', tmdb_rating: 8.4, tmdb_vote_count: 100 }
const candidate: Candidate = { id: asCandidateId(42), tmdb_id: asTmdbId(550), movie: film, nominated_by: user, created_at: night.created_at }
const totals: VoteTotals = { total_votes: 2, leaders: [candidate.tmdb_id], my_vote: candidate.id, totals: [{ tmdb_id: candidate.tmdb_id, movie_night_movie_id: candidate.id, votes: 2 }], voting_open: true }
const final: MovieNight = { ...night, status: 'finalized', voting_open: false, finalized_at: '2026-11-26T18:00:00Z', finalized_tmdb_id: candidate.tmdb_id }
function setup(owner = 7, status = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(authKey, { ...user, id: owner }); client.setQueryData(accessKey(owner), { role: 'user', account_status: status }); requestContext(client, owner)
  client.setQueryData(nightOptions(client, owner, { kind: 'detail', id: 12 }).queryKey, night)
  client.setQueryData(nightOptions(client, owner, { kind: 'votes', id: 12 }).queryKey, totals)
  return client
}
function render(client: QueryClient, event = night, votes: VoteTotals | undefined = totals, candidates = [candidate], reconciling = false) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><MovieNightFinalization night={event} totals={votes} candidates={candidates} reconciling={reconciling} /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => vi.restoreAllMocks())
it.each([-1, 0, 1])('host finalization has no voting deadline (%s ms)', offset => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(night.starts_at) + offset)
  expect(render(setup())).toMatch(/<button(?![^>]*disabled)[^>]*>Finalize Movie Night/)
})
it.each(['guest', 'restricted', 'cancelled', 'pending', 'declined', 'unverified', 'outsider'] as const)('hides finalization for %s', state => {
  const client = setup(['guest', 'pending', 'declined', 'outsider'].includes(state) ? 9 : 7, state === 'restricted' ? 'restricted' : 'active')
  if (state === 'unverified') client.setQueryData(authKey, { ...user, email_verified_at: null })
  const event = { ...night, ...(state === 'cancelled' ? { status: 'cancelled' } : {}), ...(['pending', 'declined', 'outsider'].includes(state) ? { my_rsvp: state === 'declined' ? 'declined' : 'pending' } : {}) } as MovieNight
  expect(render(client, event)).not.toContain('Finalize Movie Night')
})
it.each(['zero', 'no-leaders', 'unavailable', 'reconciling'] as const)('disables action for %s totals', state => {
  const client = setup(), votes = state === 'zero' ? { ...totals, total_votes: 0 } : state === 'no-leaders' ? { ...totals, leaders: [] } : totals
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><MovieNightFinalization night={night} totals={state === 'unavailable' ? undefined : votes} candidates={[]} reconciling={state === 'reconciling'} /></MemoryRouter></QueryClientProvider>)
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Finalize Movie Night/)
})
it.each([7, 9])('stored winner for member %s does not follow frozen tied leaders', owner => {
  const html = render(setup(owner), final, { ...totals, leaders: [asTmdbId(551), asTmdbId(552)] })
  for (const value of ['Your finalized movie', film.title, '1999', '8.4', 'read-only record']) expect(html).toContain(value)
  expect(html).not.toContain('Finalize Movie Night'); expect(html).not.toContain('TMDB #551')
})
it('uses the existing single Core metadata query for off-page winner', () => {
  const client = setup(); client.setQueryData(detailOptions('550').queryKey, { data: { ...film, original_title: null, runtime: null, original_language: null, genres: [] }, meta: { stale: false } })
  expect(render(client, final, totals, [])).toContain(film.title)
  expect(client.getQueryCache().findAll({ queryKey: ['movies', 'detail'] })).toHaveLength(1)
})
it('retains stored winner/TMDB fallback when metadata fails', () => {
  const client = setup(); client.setQueryData(detailOptions('550').queryKey, { data: { ...film, original_title: null, runtime: null, original_language: null, genres: [] }, meta: { stale: false } }); client.getQueryCache().find({ queryKey: detailOptions('550').queryKey })!.setState({ status: 'error', error: new Error('provider unavailable') })
  const html = render(client, final, totals, [])
  for (const value of ['Movie TMDB #550', 'Poster unavailable', 'Your finalized movie']) expect(html).toContain(value)
})
it.each([undefined, asTmdbId(550)])('submits optional TMDB ID %s and immediately applies authoritative lifecycle', async tmdbId => {
  const client = setup(), old = requestContext(client, 7, 12, undefined, 'content'), other = requestContext(client, 7, 13)
  vi.spyOn(api, 'get').mockResolvedValue({}); const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: final } })
  await nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true, tmdbId })
  expect(post).toHaveBeenCalledWith('/api/v1/me/movie-nights/12/finalize', tmdbId === undefined ? {} : { tmdb_id: 550 }, expect.anything())
  expect(client.getQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey)).toEqual(final)
  expect(old.isCurrent()).toBe(false); expect(other.isCurrent()).toBe(true)
})
it.each([409, 422, 500, 503, undefined])('failed finalization %s preserves lifecycle and never retries', async status => {
  const client = setup(); vi.spyOn(api, 'get').mockResolvedValue({})
  const failure = { isAxiosError: true, ...(status ? { response: { status, data: status === 422 ? { errors: { tmdb_id: ['Choose a highest-voted movie.'] } } : {} } } : {}) }
  const post = vi.spyOn(api, 'post').mockRejectedValue(failure)
  await expect(nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true })).rejects.toEqual(failure)
  expect(client.getQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey)).toEqual(night)
  expect(post).toHaveBeenCalledTimes(1); expect(nightMutationOptions(client, 7).retry).toBe(false)
})
it('preserves tie leader TMDB IDs and stale-selection classification', () => {
  const tie = movieNightError({ isAxiosError: true, response: { status: 409, data: { code: 'MOVIE_NIGHT_TIE', leaders: [550, 551] } } })
  expect(tie.code).toBe('MOVIE_NIGHT_TIE'); expect(tie.leaders).toEqual([550, 551]); expect(tie.refresh).toBe(true)
  expect(movieNightError({ isAxiosError: true, response: { status: 422, data: { errors: { tmdb_id: ['Choose a highest-voted movie.'] } } } }).staleSelection).toBe(true)
})
it.each(['logout', 'switch', 'revoke'] as const)('late success after %s cannot restore private data', async change => {
  const client = setup(); let resolve!: (value: unknown) => void
  const late = new Promise(done => { resolve = done })
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'post').mockReturnValue(late)
  const result = nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true }).catch(error => error)
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
  if (change === 'revoke') purgeNight(client, 7, 12); else client.setQueryData(authKey, change === 'logout' ? null : { ...user, id: 9 })
  resolve({ data: { data: final } }); expect((await result).message).toContain('account or event access changed')
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
})
it.each(['logout', 'switch', 'revoke'] as const)('late conflict after %s cannot invalidate a newly authorized same-owner event', async change => {
  const client = setup(); let reject!: (value: unknown) => void
  const late = new Promise((_done, fail) => { reject = fail })
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'post').mockReturnValue(late)
  const pending = nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true }).catch(error => error)
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
  if (change === 'revoke') purgeNight(client, 7, 12); else { client.setQueryData(authKey, change === 'logout' ? null : { ...user, id: 9 }); client.setQueryData(authKey, user) }
  const options = nightOptions(client, 7, { kind: 'detail', id: 12 }); client.setQueryData(options.queryKey, final)
  reject({ isAxiosError: true, response: { status: 409 } }); await pending
  expect(client.getQueryData(options.queryKey)).toEqual(final); expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(false)
})
it.each(['detail', 'votes', 'shortlist'] as const)('an older in-flight %s response cannot overwrite finalized lifecycle/content', async kind => {
  const client = setup(); let release!: (value: unknown) => void
  const late = new Promise(done => { release = done })
  vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({}) : late)
  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: final } })
  const options = nightOptions(client, 7, { kind, id: 12 })
  if (kind === 'votes') client.removeQueries({ queryKey: options.queryKey })
  const read = client.fetchQuery(options).catch(error => error)
  await vi.waitFor(() => expect(api.get).toHaveBeenCalled())
  await nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true })
  release({ data: { data: kind === 'detail' ? night : totals } }); await read
  expect(client.getQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey)).toEqual(final)
  if (kind !== 'detail') expect(client.getQueryData(options.queryKey)).toBeUndefined()
})
it.each([401, 403, 404])('finalization denial %s purges event and mixed collection caches but preserves unrelated events', async status => {
  const client = setup(); client.setQueryData(nightKeys.lists(7), { data: [night] }); client.setQueryData(nightKeys.inbox(7), { data: [] })
  const other = nightOptions(client, 7, { kind: 'detail', id: 13 }); client.setQueryData(other.queryKey, { ...night, id: 13 })
  vi.spyOn(api, 'get').mockResolvedValue({}); vi.spyOn(api, 'post').mockRejectedValue({ isAxiosError: true, response: { status } })
  await expect(nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true })).rejects.toBeDefined()
  expect(client.getQueryCache().findAll({ queryKey: nightKeys.event(7, 12) })).toHaveLength(0)
  expect(client.getQueryData(nightKeys.lists(7))).toBeUndefined(); expect(client.getQueryData(nightKeys.inbox(7))).toBeUndefined()
  // A session-level 401 also retires all owner caches; event 403/404 stays isolated.
  if (status !== 401) expect(client.getQueryData(other.queryKey)).toEqual({ ...night, id: 13 })
})
it.each(['pending', 'declined'] as const)('never renders the finalized winner for %s membership', rsvp => {
  const client = setup(9)
  expect(render(client, { ...final, my_rsvp: rsvp } as unknown as MovieNight)).toBe('')
  expect(client.getQueryCache().findAll({ queryKey: ['movies', 'detail'] })).toHaveLength(0)
})
it.each([7, 9])('restricted member %s retains finalized winner reads without finalization controls', owner => {
  const html = render(setup(owner, 'restricted'), final)
  expect(html).toContain(film.title); expect(html).not.toContain('Finalize Movie Night')
})
it.each(['nominate', 'remove', 'vote', 'finalize'] as const)('a synchronous shared %s command excludes all same-event commands before observer updates', first => {
  const client = setup(), accepted: string[] = []
  // Separate consumers call the same primitive in one JS turn, before any mutation/React notification.
  const run = (kind: string) => { const release = acquireNightCommand(client, 7, 12); if (release) accepted.push(kind); return release }
  const release = run(first)
  for (const next of ['nominate', 'remove', 'vote', 'finalize']) expect(run(next)).toBeUndefined()
  expect(accepted).toEqual([first]); release!()
  const retry = run('next explicit command'); expect(retry).toBeTypeOf('function'); retry!()
})
it('shares command exclusion across consumers while isolating QueryClients, owners and event IDs', () => {
  const client = setup(), otherClient = setup()
  const releases = [acquireNightCommand(client, 7, 12), acquireNightCommand(client, 7, 13), acquireNightCommand(client, 9, 12), acquireNightCommand(otherClient, 7, 12)]
  expect(releases.every(Boolean)).toBe(true); expect(acquireNightCommand(client, 7, 12)).toBeUndefined()
  releases.forEach(release => release!())
})
it('retains unresolved shared command exclusion through restriction and restoration', () => {
  const client = setup(), release = acquireNightCommand(client, 7, 12)!
  for (const status of ['restricted', 'active']) { client.setQueryData(accessKey(7), { role: 'user', account_status: status }); expect(acquireNightCommand(client, 7, 12)).toBeUndefined() }
  release(); const retry = acquireNightCommand(client, 7, 12); expect(retry).toBeTypeOf('function'); retry!()
})
it.each(['session', 'event'] as const)('old %s command cleanup cannot unlock a new authorization generation', change => {
  const client = setup(), old = acquireNightCommand(client, 7, 12)!
  if (change === 'event') purgeNight(client, 7, 12); else { client.setQueryData(authKey, null); client.setQueryData(authKey, user) }
  const fresh = acquireNightCommand(client, 7, 12); expect(fresh).toBeTypeOf('function')
  old(); old(); expect(acquireNightCommand(client, 7, 12)).toBeUndefined(); fresh!()
})
it.each(['invalidated', 'error'] as const)('cached totals cannot enable confirmation when the authoritative query is %s', state => {
  const client = setup(), options = nightOptions(client, 7, { kind: 'votes', id: 12 })
  const query = client.getQueryCache().find({ queryKey: options.queryKey })!
  if (state === 'invalidated') query.invalidate(); else query.setState({ status: 'error', error: new Error('503') })
  expect(client.getQueryData(options.queryKey)).toEqual(totals)
  expect(render(client)).toMatch(/<button[^>]*disabled=""[^>]*>Finalize Movie Night/)
})
it.each([['tie', 503], ['tie', 'network'], ['selection', 503], ['selection', 'network']] as const)('%s conflict with failed %s reconciliation blocks stale totals until explicit successful recovery', async (conflict, failure) => {
  const client = setup(), options = { ...nightOptions(client, 7, { kind: 'votes', id: 12 }), gcTime: Infinity }
  const fresh = { ...totals, leaders: [asTmdbId(551), asTmdbId(552)] }
  let failRead = true
  vi.spyOn(api, 'get').mockImplementation(path => path === '/sanctum/csrf-cookie' ? Promise.resolve({}) : failRead ? Promise.reject({ isAxiosError: true, ...(failure === 503 ? { response: { status: 503 } } : {}) }) : Promise.resolve({ data: { data: fresh } }))
  const observer = new QueryObserver(client, options), stop = observer.subscribe(() => {})
  await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true))
  // Seed a previously successful cached result, then let the conflict's real invalidation refetch fail.
  client.setQueryData(options.queryKey, totals)
  const post = vi.spyOn(api, 'post').mockRejectedValue({ isAxiosError: true, response: { status: conflict === 'tie' ? 409 : 422, data: conflict === 'tie' ? { code: 'MOVIE_NIGHT_TIE', leaders: [551, 552] } : { errors: { tmdb_id: ['Choose a highest-voted movie.'] } } } })
  await expect(nightMutationOptions(client, 7).mutationFn({ kind: 'finalize', id: 12, confirmed: true, ...(conflict === 'selection' ? { tmdbId: asTmdbId(550) } : {}) })).rejects.toBeDefined()
  await vi.waitFor(() => expect(client.getQueryState(options.queryKey)?.status).toBe('error'))
  expect(client.getQueryData(options.queryKey)).toEqual(totals)
  expect(render(client)).toMatch(/<button[^>]*disabled=""[^>]*>Finalize Movie Night/)
  expect(post).toHaveBeenCalledTimes(1)
  failRead = false; await observer.refetch()
  expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(false)
  expect(render(client, night, fresh)).toMatch(/<button(?![^>]*disabled)[^>]*>Finalize Movie Night/)
  expect(post).toHaveBeenCalledTimes(1); stop()
})

it.each(['unchanged', 'new-leaders'] as const)('binds a confirmation to its exact voting revision after a successful %s refresh', change => {
  const client = setup(), old = finalizationAdmission(client, 7, 12)
  expect(old.isCurrent()).toBe(true)
  client.setQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey, { ...totals, ...(change === 'new-leaders' ? { leaders: [asTmdbId(551), asTmdbId(552)] } : {}) })
  expect(old.isCurrent()).toBe(false)
  expect(finalizationAdmission(client, 7, 12).isCurrent()).toBe(true)
})
it('rejects an original confirmation after permission loss/restoration even without voting changes or a render', () => {
  const client = setup(), old = finalizationAdmission(client, 7, 12)
  const revision = client.getQueryState(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)!.dataUpdateCount
  client.setQueryData(accessKey(7), { role: 'user', account_status: 'restricted' })
  client.setQueryData(accessKey(7), { role: 'user', account_status: 'active' })
  expect(client.getQueryState(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey)!.dataUpdateCount).toBe(revision)
  expect(old.isCurrent()).toBe(false); expect(finalizationAdmission(client, 7, 12).isCurrent()).toBe(true)
})
it.each(['logout', 'switch'] as const)('rejects an original confirmation after %s and same-owner fresh session replacement', change => {
  const client = setup(), old = finalizationAdmission(client, 7, 12)
  client.setQueryData(authKey, change === 'logout' ? null : { ...user, id: 9 }); client.setQueryData(authKey, user)
  client.setQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey, night)
  client.setQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey, totals)
  expect(old.isCurrent()).toBe(false); expect(finalizationAdmission(client, 7, 12).isCurrent()).toBe(true)
})
it('rejects the original event authorization generation after fresh authorized retrieval', () => {
  const client = setup(), old = finalizationAdmission(client, 7, 12)
  purgeNight(client, 7, 12)
  client.setQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey, night)
  client.setQueryData(nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey, totals)
  expect(old.isCurrent()).toBe(false); expect(finalizationAdmission(client, 7, 12).isCurrent()).toBe(true)
})
it('rejects a replaced voting query even if its data update count matches the original confirmation', () => {
  const client = setup(), old = finalizationAdmission(client, 7, 12), key = nightOptions(client, 7, { kind: 'votes', id: 12 }).queryKey
  client.removeQueries({ queryKey: key }); client.setQueryData(key, totals)
  expect(client.getQueryState(key)!.dataUpdateCount).toBe(old.revision)
  expect(old.isCurrent()).toBe(false); expect(finalizationAdmission(client, 7, 12).isCurrent()).toBe(true)
})
it('explicit retirement never becomes current again and does not retire a newly opened confirmation', () => {
  const client = setup(), old = finalizationAdmission(client, 7, 12)
  old.retire(); const fresh = finalizationAdmission(client, 7, 12)
  old.retire(); expect(old.isCurrent()).toBe(false); expect(fresh.isCurrent()).toBe(true)
})
it('rejects confirmation if the authoritative event lifecycle closes before the UI rerenders', () => {
  const client = setup(), old = finalizationAdmission(client, 7, 12)
  client.setQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey, final)
  expect(old.isCurrent()).toBe(false)
})
