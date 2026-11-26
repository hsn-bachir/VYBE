import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { movieNightApi as nights } from '../api/movieNightApi'
import { asCandidateId, asTmdbId } from '../types/movieNight.types'
import { movieNightError } from '../api/errors'

const context = { isCurrent: () => true, signal: new AbortController().signal }
const root = '/api/v1/me/movie-nights'
const fields = { title: 'Night', starts_at: '2027-07-16T18:00:00Z', timezone: 'Asia/Beirut' }
beforeEach(() => vi.restoreAllMocks())
const cases = [
  ['list', 'get', root, undefined, { page: 2, per_page: 10, status: 'scheduled' }, () => nights.list({ page: 2, per_page: 10, status: 'scheduled' }, context)],
  ['create', 'post', root, fields, undefined, () => nights.create(fields, context)],
  ['detail', 'get', `${root}/12`, undefined, undefined, () => nights.detail(12, context)],
  ['update', 'patch', `${root}/12`, { location: null }, undefined, () => nights.update(12, { location: null }, context)],
  ['cancel', 'post', `${root}/12/cancel`, {}, undefined, () => nights.cancel(12, context)],
  ['lookup', 'get', `${root}/12/eligible-users`, undefined, { page: 1, per_page: 20, query: 'fan' }, () => nights.eligibleUsers(12, ' FAN ', {}, context)],
  ['invite', 'post', `${root}/12/invitations`, { invited_user_id: 8 }, undefined, () => nights.invite(12, 8, context)],
  ['roster', 'get', `${root}/12/invitations`, undefined, { page: 1, per_page: 20 }, () => nights.roster(12, {}, context)],
  ['received', 'get', `${root}/invitations`, undefined, { page: 1, per_page: 20 }, () => nights.received({}, context)],
  ['rsvp', 'put', `${root}/12/rsvp`, { rsvp_status: 'declined' }, undefined, () => nights.rsvp(12, 'declined', context)],
  ['shortlist', 'get', `${root}/12/movies`, undefined, { page: 1, per_page: 20 }, () => nights.shortlist(12, {}, context)],
  ['nominate', 'post', `${root}/12/movies`, { tmdb_id: 550 }, undefined, () => nights.nominate(12, asTmdbId(550), context)],
  ['remove', 'delete', `${root}/12/movies/42`, undefined, undefined, () => nights.remove(12, asCandidateId(42), context)],
  ['vote', 'put', `${root}/12/vote`, { movie_night_movie_id: 42 }, undefined, () => nights.vote(12, asCandidateId(42), context)],
  ['votes', 'get', `${root}/12/votes`, undefined, undefined, () => nights.votes(12, context)],
  ['finalize', 'post', `${root}/12/finalize`, { tmdb_id: 550 }, undefined, () => nights.finalize(12, asTmdbId(550), context)],
] as const
it.each(cases)('%s uses the exact Core request contract and response envelope', async (_name, method, path, body, params, run) => {
  const payload = { data: [], meta: { page: 1 } }
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: payload })
  const write = method === 'get' ? undefined : vi.spyOn(api, method).mockResolvedValue({ data: payload })
  const result = await run()
  const config = { signal: context.signal }
  if (method === 'get') {
    expect(get).toHaveBeenCalledExactlyOnceWith(path, { ...config, ...(params ? { params } : {}) })
    expect(result).toBe(path === `${root}/12` || path.endsWith('/votes') ? payload.data : payload)
  } else {
    expect(get).toHaveBeenCalledExactlyOnceWith('/sanctum/csrf-cookie', config)
    if (method === 'delete') expect(write).toHaveBeenCalledExactlyOnceWith(path, config)
    else expect(write).toHaveBeenCalledExactlyOnceWith(path, body, config)
    expect(get.mock.invocationCallOrder[0]).toBeLessThan(write!.mock.invocationCallOrder[0])
    expect(result).toBe(method === 'delete' ? undefined : payload.data)
  }
})
it('omits automatic finalization selection and preserves an empty request', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: {} } })
  await nights.finalize(12, undefined, context)
  expect(post).toHaveBeenCalledWith(`${root}/12/finalize`, {}, { signal: context.signal })
})
it('blocks a write when the account changes while initializing CSRF', async () => {
  let current = true
  vi.spyOn(api, 'get').mockImplementation(async () => { current = false; return {} })
  const post = vi.spyOn(api, 'post')
  await expect(nights.create(fields, { isCurrent: () => current })).rejects.toThrow('account or event access changed')
  expect(post).not.toHaveBeenCalled()
})
it('does not write after failed CSRF or retry the failed write', async () => {
  const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('CSRF'))
  const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('write'))
  await expect(nights.create(fields, context)).rejects.toThrow('CSRF')
  expect(post).not.toHaveBeenCalled()
  get.mockResolvedValue({})
  await expect(nights.create(fields, context)).rejects.toThrow('write')
  expect(post).toHaveBeenCalledTimes(1)
})
it('rejects aborted reads without dispatch', async () => {
  const controller = new AbortController(); controller.abort()
  const get = vi.spyOn(api, 'get')
  await expect(nights.detail(12, { ...context, signal: controller.signal })).rejects.toThrow('account or event access changed')
  expect(get).not.toHaveBeenCalled()
})
it('preserves the stable tie code and only valid authoritative TMDB leader IDs', () => {
  const result = movieNightError({ isAxiosError: true, response: { status: 409, data: { code: 'MOVIE_NIGHT_TIE', leaders: [550, 551, 'secret', -1] } } })
  expect(result.code).toBe('MOVIE_NIGHT_TIE'); expect(result.leaders).toEqual([550, 551]); expect(result.refresh).toBe(true)
})
it('distinguishes stale selection from lifecycle conflicts and retains retry-after', () => {
  const stale = movieNightError({ isAxiosError: true, response: { status: 422, data: { errors: { tmdb_id: ['Choose a highest-voted movie.'] } } } })
  expect(stale.staleSelection).toBe(true); expect(stale.fields.tmdb_id).toHaveLength(1)
  expect(movieNightError({ isAxiosError: true, response: { status: 409, data: {} } }).code).toBeUndefined()
  expect(movieNightError({ isAxiosError: true, response: { status: 429, headers: { 'retry-after': '60' } } }).retryAfter).toBe('60')
})
it.each([401, 403, 404, 409, 419, 422, 429, 500, 503])('uses safe feedback for HTTP %s', status => {
  const result = movieNightError({ isAxiosError: true, response: { status, data: { message: 'SQL private location secret' } } })
  expect(result.message).not.toContain('secret'); expect(result.message).not.toContain('Invalid email or password')
})
it('validates ID ranges and enforces separate candidate/TMDB types', () => {
  expect(() => asTmdbId(2147483648)).toThrow(); expect(() => asCandidateId(0)).toThrow()
  const verifyTypes = () => {
    // @ts-expect-error Core candidate IDs cannot nominate a TMDB movie.
    void nights.nominate(12, asCandidateId(42), context)
    // @ts-expect-error TMDB IDs cannot be used for voting.
    void nights.vote(12, asTmdbId(550), context)
    // @ts-expect-error Removal addresses a Core candidate, not a TMDB movie.
    void nights.remove(12, asTmdbId(550), context)
  }
  expect(verifyTypes).toBeTypeOf('function')
})
