import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { changeReview, personalReview, reviewError, reviewsPage } from '../api/reviewsApi'
import { ReviewCard } from '../components/ReviewCard'
import { ReviewEditor } from '../components/ReviewEditor'
import { DeleteReviewDialog } from '../components/DeleteReviewDialog'
import CommunityReviewsSection from '../components/CommunityReviewsSection'
import { personalReviewOptions, reviewKeys, reviewsOptions, synchronizeReview } from '../hooks/useReviews'
import type { Review, ReviewValues } from '../types/review.types'

const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-11-03T00:00:00Z' }
const review: Review = { id: 4, tmdb_id: 550, author: { id: 7, username: 'fixture', avatar_url: null }, body: 'A thoughtful film.\nA second paragraph.', contains_spoilers: false, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' }
const values: ReviewValues = { body: review.body, contains_spoilers: false }
function cache() { const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } }); client.setQueryData(authKey, user); return client }
function renderSection(client = cache()) { return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><CommunityReviewsSection movie={550} title="Fixture movie" /></MemoryRouter></QueryClientProvider>) }
beforeEach(() => vi.restoreAllMocks())

it('uses bounded Core list and personal paths with cancellation', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [review], meta: { page: 2 } } })
  const signal = new AbortController().signal
  await reviewsPage(550, 2, 20, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/movies/550/reviews', { params: { page: 2, per_page: 20 }, signal })
  get.mockResolvedValueOnce({ data: { data: null } })
  expect(await personalReview(550, signal)).toBeNull()
  expect(get).toHaveBeenCalledWith('/api/v1/me/reviews/550', { signal })
})
it('bootstraps CSRF and keeps create, partial edit and delete distinct', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: review } })
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: review } })
  const del = vi.spyOn(api, 'delete').mockResolvedValue({})
  expect(await changeReview(550, { action: 'create', values }, () => true)).toEqual(review)
  await changeReview(550, { action: 'edit', id: 4, values: { contains_spoilers: true } }, () => true)
  expect(await changeReview(550, { action: 'delete', id: 4 }, () => true)).toBeNull()
  expect(get).toHaveBeenCalledTimes(3)
  expect(get.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0])
  expect(post).toHaveBeenCalledWith('/api/v1/movies/550/reviews', values)
  expect(patch).toHaveBeenCalledWith('/api/v1/movies/550/reviews/4', { contains_spoilers: true })
  expect(del).toHaveBeenCalledWith('/api/v1/movies/550/reviews/4')
})
it('never dispatches a write if the account changes during CSRF', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post'), patch = vi.spyOn(api, 'patch'), del = vi.spyOn(api, 'delete')
  await expect(changeReview(550, { action: 'create', values }, () => false)).rejects.toThrow('account changed')
  await expect(changeReview(550, { action: 'edit', id: 4, values }, () => false)).rejects.toThrow('account changed')
  await expect(changeReview(550, { action: 'delete', id: 4 }, () => false)).rejects.toThrow('account changed')
  expect(post).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled()
})
it('does not turn a conflicting POST into PATCH or conceal failure', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const conflict = { isAxiosError: true, response: { status: 409, data: { code: 'REVIEW_EXISTS' } } }
  vi.spyOn(api, 'post').mockRejectedValue(conflict)
  const patch = vi.spyOn(api, 'patch')
  await expect(changeReview(550, { action: 'create', values }, () => true)).rejects.toBe(conflict)
  expect(patch).not.toHaveBeenCalled()
  expect(reviewError(conflict)).toContain('draft is preserved')
})
it('does not write after a failed CSRF bootstrap', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
  const post = vi.spyOn(api, 'post')
  await expect(changeReview(550, { action: 'create', values }, () => true)).rejects.toThrow('offline')
  expect(post).not.toHaveBeenCalled()
})
it('includes movie/page/page size and private account in query identity', () => {
  expect(reviewsOptions(550, 1).queryKey).not.toEqual(reviewsOptions(550, 2).queryKey)
  expect(reviewsOptions(550, 1, 20).queryKey).not.toEqual(reviewsOptions(550, 1, 50).queryKey)
  expect(reviewsOptions(550, 1).queryKey).not.toEqual(reviewsOptions(551, 1).queryKey)
  expect(personalReviewOptions(7, 550).queryKey).not.toEqual(personalReviewOptions(8, 550).queryKey)
  expect(personalReviewOptions(0, 550).enabled).toBe(false)
  expect(reviewsOptions(550, 1).retry).toBe(false)
})
it('invalidates matching public lists/personal review and preserves ratings and libraries', async () => {
  const client = cache()
  for (const key of [['movies', 'ratings', 550], ['library', 7, 'watchlist', 1], ['library', 7, 'collections', 1], ['movies', 'detail', '550']]) client.setQueryData(key, { saved: true })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  expect(await synchronizeReview(client, 7, 550, review)).toBe(true)
  expect(client.getQueryData(reviewKeys.own(7, 550))).toEqual(review)
  expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([reviewKeys.own(7, 550), reviewKeys.lists(550)])
  expect(client.getQueryState(['movies', 'ratings', 550])?.isInvalidated).toBe(false)
  expect(client.getQueryState(['library', 7, 'collections', 1])?.isInvalidated).toBe(false)
  expect(client.getQueryState(['library', 7, 'watchlist', 1])?.isInvalidated).toBe(false)
  await synchronizeReview(client, 7, 550, null)
  expect(client.getQueryData(reviewKeys.own(7, 550))).toBeNull()
})
it('rejects old-account completion before and after cancellation', async () => {
  const client = cache(); client.setQueryData(authKey, { ...user, id: 8 })
  expect(await synchronizeReview(client, 7, 550, review)).toBe(false)
  expect(client.getQueryData(reviewKeys.own(7, 550))).toBeUndefined()
  client.setQueryData(authKey, user)
  vi.spyOn(client, 'cancelQueries').mockImplementation(async () => { client.setQueryData(authKey, null) })
  expect(await synchronizeReview(client, 7, 550, review)).toBe(false)
  expect(client.getQueryData(reviewKeys.own(7, 550))).toBeUndefined()
})
it('conceals spoiler content completely from rendered HTML and reading order', () => {
  const html = renderToStaticMarkup(<ReviewCard review={{ ...review, contains_spoilers: true, body: 'Secret final-scene revelation' }} />)
  expect(html).toContain('This review contains spoilers.')
  expect(html).toContain('Reveal review'); expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('Secret final-scene revelation')
})
it('renders plain text safely and does not accept executable avatar URLs', () => {
  const html = renderToStaticMarkup(<ReviewCard review={{ ...review, body: '<script>alert(1)</script>\n<img src=x onerror=alert(2)>', author: { ...review.author, avatar_url: 'javascript:alert(3)' } }} />)
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).not.toContain('<img')
  expect(html).toContain('dateTime="2026-11-03T00:00:00Z"')
})
it('offers expansion for long plain reviews without truncating API state', () => {
  const html = renderToStaticMarkup(<ReviewCard review={{ ...review, body: 'x'.repeat(700) }} />)
  expect(html).toContain('Read full review'); expect(html).toContain('aria-expanded="false"')
  expect(review.body).toContain('A thoughtful film.')
})
it('renders real review list, author controls, totals and pagination', () => {
  const client = cache(); client.setQueryData(reviewKeys.own(7, 550), review)
  client.setQueryData(reviewKeys.page(550, 1, 20), { data: [review], meta: { page: 1, per_page: 20, total_pages: 2, total_results: 21 } })
  const html = renderSection(client)
  expect(html).toContain('Edit your review'); expect(html).toContain('21'); expect(html).toContain('Next reviews'); expect(html).toContain('@fixture')
  expect(html).toContain('Your review'); expect(html).not.toContain(user.email)
})
it('shows empty, loading and guest behaviors without fake reviews', () => {
  const client = cache(); client.setQueryData(authKey, null)
  expect(renderSection(client)).toContain('Loading community reviews')
  client.setQueryData(reviewKeys.page(550, 1, 20), { data: [], meta: { page: 1, per_page: 20, total_pages: 0, total_results: 0 } })
  const html = renderSection(client)
  expect(html).toContain('No reviews yet.'); expect(html).toContain('Sign in to write a review'); expect(html).not.toContain('review-card')
})
it('prepopulates editing and counts Unicode characters after trimming', () => {
  const unicode = { body: `  ${'🎬'.repeat(5000)}  `, contains_spoilers: true }
  const html = renderToStaticMarkup(<ReviewEditor title="Fixture" initialValues={unicode} review={review} error={null} pending={false} onSubmit={() => {}} onCancel={() => {}} onEditExisting={() => {}} onCheckExisting={() => {}} />)
  expect(html).toContain('5,000 / 5,000'); expect(html).toContain('checked=""'); expect(html).toContain('Save changes')
  expect(html).not.toContain('maxLength=')
})
it('preserves the draft and offers an explicit existing-review action on conflict', () => {
  const html = renderToStaticMarkup(<ReviewEditor title="Fixture" initialValues={{ body: 'My unsaved draft', contains_spoilers: true }} review={null} existingReview={review} error={{ isAxiosError: true, response: { status: 409 } }} pending={false} onSubmit={() => {}} onCancel={() => {}} onEditExisting={() => {}} onCheckExisting={() => {}} />)
  expect(html).toContain('My unsaved draft'); expect(html).toContain('Open existing review to edit'); expect(html).toContain('Publish review')
})
it('uses an accessible destructive confirmation with cancel as the default focus target', () => {
  const html = renderToStaticMarkup(<DeleteReviewDialog pending error={null} onClose={() => {}} onDelete={() => {}} />)
  expect(html).toContain('<dialog'); expect(html).toContain('aria-labelledby='); expect(html).toContain('Keep review'); expect(html).toContain('disabled=""'); expect(html).toContain('Your rating')
})
it.each([401, 403, 404, 409, 419, 422, 429, 500, 503])('reports safe contextual review error %s', status => {
  expect(reviewError({ isAxiosError: true, response: { status, data: { message: 'SQL secret' } } })).not.toMatch(/SQL secret|Invalid email or password/)
})
