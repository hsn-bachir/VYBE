import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { PeekRating } from '../../../components/react-bits/PeekRating'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { changeRating, personalRating, ratingError, ratingStatistics } from '../api/ratingsApi'
import CommunityRatingSection from '../components/CommunityRatingSection'
import { RatingHistogram } from '../components/RatingHistogram'
import { personalRatingOptions, ratingKeys, statisticsOptions, synchronizeRating } from '../hooks/useRatings'
import type { RatingStatistics } from '../types/rating.types'

const user = { id: 7, username: 'test', email: 'test@example.test', email_verified_at: '2026-11-03T00:00:00Z', avatar_url: null }
const saved = { tmdb_id: 550, rating: 4 as const, updated_at: '2026-11-03T00:00:00Z' }
const stats: RatingStatistics = { tmdb_id: 550, average_rating: 4.5, total_ratings: 2, distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 } }
function cache() { const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity, retry: false } } }); client.setQueryData(authKey, user); return client }
function render(client: QueryClient) { return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><CommunityRatingSection movie={550} /></MemoryRouter></QueryClientProvider>) }
beforeEach(() => vi.restoreAllMocks())

it('releases a confirmed rating before background refetches finish', async () => {
  const client = cache()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(() => new Promise(() => {}))
  await expect(synchronizeRating(client, 7, 550, saved)).resolves.toBe(true)
  expect(client.getQueryData(ratingKeys.own(7, 550))).toEqual(saved)
  expect(invalidate).toHaveBeenCalledTimes(2)
})

it('uses Core endpoints with AbortSignal and distinct public/personal DTOs', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: stats } })
  const signal = new AbortController().signal
  expect(await ratingStatistics(550, signal)).toEqual(stats)
  expect(get).toHaveBeenCalledWith('/api/v1/movies/550/ratings', { signal })
  get.mockResolvedValueOnce({ data: { data: null } })
  expect(await personalRating(550, signal)).toBeNull()
  expect(get).toHaveBeenCalledWith('/api/v1/me/ratings/550', { signal })
})
it('bootstraps CSRF for PUT and DELETE, submits only rating and returns server state', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({})
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { data: saved } })
  const del = vi.spyOn(api, 'delete').mockResolvedValue({})
  expect(await changeRating(550, { action: 'put', rating: 4 }, () => true)).toEqual(saved)
  expect(await changeRating(550, { action: 'delete' }, () => true)).toBeNull()
  expect(get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
  expect(put).toHaveBeenCalledWith('/api/v1/me/ratings/550', { rating: 4 })
  expect(del).toHaveBeenCalledWith('/api/v1/me/ratings/550')
  expect(get.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0])
})
it('blocks writes after the account changes during CSRF', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const put = vi.spyOn(api, 'put')
  const del = vi.spyOn(api, 'delete')
  await expect(changeRating(550, { action: 'put', rating: 4 }, () => false)).rejects.toThrow('account changed')
  await expect(changeRating(550, { action: 'delete' }, () => false)).rejects.toThrow('account changed')
  expect(put).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled()
})
it('does not write or report success after failed CSRF or API responses', async () => {
  const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
  const put = vi.spyOn(api, 'put').mockRejectedValue(new Error('failed write'))
  await expect(changeRating(550, { action: 'put', rating: 4 }, () => true)).rejects.toThrow('offline')
  expect(put).not.toHaveBeenCalled()
  get.mockResolvedValue({})
  await expect(changeRating(550, { action: 'put', rating: 4 }, () => true)).rejects.toThrow('failed write')
})
it('isolates movie and account query identities and disables unresolved private reads', () => {
  expect(statisticsOptions(550).enabled).toBe(true)
  expect(personalRatingOptions(0, 550).enabled).toBe(false)
  expect(personalRatingOptions(7, 0).enabled).toBe(false)
  expect(personalRatingOptions(7, 550).queryKey).not.toEqual(personalRatingOptions(8, 550).queryKey)
  expect(statisticsOptions(550).queryKey).not.toEqual(statisticsOptions(551).queryKey)
  expect(personalRatingOptions(7, 550).retry).toBe(false)
})
it('synchronizes confirmed rating and only matching statistics, preserving other feature caches', async () => {
  const client = cache()
  client.setQueryData(['library', 7, 'watchlist', 1], { saved: true })
  client.setQueryData(['library', 7, 'collections', 1], { saved: true })
  client.setQueryData(['movies', 'detail', '550'], { title: 'Test' })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  expect(await synchronizeRating(client, 7, 550, saved)).toBe(true)
  expect(client.getQueryData(ratingKeys.own(7, 550))).toEqual(saved)
  expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([ratingKeys.own(7, 550), ratingKeys.statistics(550)])
  expect(client.getQueryState(['library', 7, 'watchlist', 1])?.isInvalidated).toBe(false)
  expect(client.getQueryState(['library', 7, 'collections', 1])?.isInvalidated).toBe(false)
  expect(client.getQueryState(['movies', 'detail', '550'])?.isInvalidated).toBe(false)
  await synchronizeRating(client, 7, 550, null)
  expect(client.getQueryData(ratingKeys.own(7, 550))).toBeNull()
})
it('ignores late callbacks from a previous account, including changes during cancellation', async () => {
  const client = cache()
  client.setQueryData(authKey, { ...user, id: 8 })
  expect(await synchronizeRating(client, 7, 550, saved)).toBe(false)
  expect(client.getQueryData(ratingKeys.own(7, 550))).toBeUndefined()
  client.setQueryData(authKey, user)
  vi.spyOn(client, 'cancelQueries').mockImplementation(async () => { client.setQueryData(authKey, null) })
  expect(await synchronizeRating(client, 7, 550, saved)).toBe(false)
  expect(client.getQueryData(ratingKeys.own(7, 550))).toBeUndefined()
})
it('renders real community average and all five accessible histogram buckets', () => {
  const client = cache(); client.setQueryData(ratingKeys.statistics(550), stats); client.setQueryData(ratingKeys.own(7, 550), saved)
  const html = render(client)
  expect(html).toContain('4.50'); expect(html).toContain('/ 5'); expect(html).toContain('separate 0–10 scale')
  expect(html).toContain('5 stars: 1 rating (50%)'); expect(html).toContain('1 stars: 0 ratings (0%)')
  expect(html).toContain('Remove rating'); expect(html).toMatch(/<input[^>]*checked=""[^>]*value="4"/)
})
it('uses a null average empty state and zero bars without division by zero', () => {
  const client = cache(); client.setQueryData(ratingKeys.statistics(550), { ...stats, average_rating: null, total_ratings: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } }); client.setQueryData(ratingKeys.own(7, 550), null)
  const html = render(client)
  expect(html).toContain('No community ratings yet.')
  expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity'); expect(html).not.toContain('Remove rating')
})
it('provides guest sign-in and verified-account behavior without blocking public statistics', () => {
  const client = cache(); client.setQueryData(ratingKeys.statistics(550), stats); client.setQueryData(authKey, null)
  expect(render(client)).toContain('Sign in to rate this movie')
  client.setQueryData(authKey, { ...user, email_verified_at: null })
  expect(render(client)).toContain('Verify email to rate movies')
  expect(render(client)).toContain('4.50')
})
it('renders exactly five labelled native radio choices and confirmed state', () => {
  const html = renderToStaticMarkup(<PeekRating value={3} onChange={() => {}} disabled confirmation={0} />)
  expect(html.match(/type="radio"/g)).toHaveLength(5)
  expect(html).toContain('aria-label="1 star"'); expect(html).toContain('aria-label="5 stars"')
  expect(html).toContain('disabled=""'); expect(html).toContain('aria-busy="true"')
  expect(html).toMatch(/<input[^>]*checked=""[^>]*value="3"/); expect(html).not.toContain('peek-confirmed')
})
it('exposes exact counts even when rounded histogram percentages do not sum to 100', () => {
  const html = renderToStaticMarkup(<RatingHistogram statistics={{ ...stats, total_ratings: 3, distribution: { '1': 1, '2': 1, '3': 1, '4': 0, '5': 0 } }} />)
  expect(html).toContain('1 stars: 1 rating (33%)'); expect(html).not.toContain('NaN')
})
it.each([401, 403, 419, 422, 429, 500, 503])('reports safe rating failure %s', status => {
  expect(ratingError({ isAxiosError: true, response: { status, data: { message: 'SQL secret' } } })).not.toMatch(/SQL secret|Invalid email or password/)
})
it('distinguishes an unavailable read from a failed save', () => {
  const error = { isAxiosError: true, response: { status: 503 } }
  expect(ratingError(error)).not.toContain('was not saved')
  expect(ratingError(error, true)).toContain('was not saved')
})
