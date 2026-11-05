import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { accessKey } from '../../auth/hooks/useAccess'
import { authKey } from '../../auth/hooks/useAuth'
import { ReviewCard } from '../../reviews/components/ReviewCard'
import { ReportReviewDialog } from '../../reviews/components/ReportReviewDialog'
import { moderationError, reports, submitReport, changeModeration, type Report, type ModerationReview } from '../api/moderationApi'
import { moderationKeys } from '../hooks/useModeration'
import ReportsPage from '../pages/ReportsPage'
import ReportDetailsPage from '../pages/ReportDetailsPage'
import ModerationReviewsPage from '../pages/ModerationReviewsPage'

const actor = { id: 8, username: 'mod', email: 'mod@example.test', avatar_url: null, email_verified_at: '2026-11-05T00:00:00Z' }
const review: ModerationReview = { id: 12, tmdb_id: 550, author: { id: 7, username: 'writer' }, body: 'A reported review', visibility: 'visible',
  author_contains_spoilers: false, moderator_spoiler: false, contains_spoilers: false, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' }
const report: Report = { id: 4, target_type: 'review', target_id: 12, reason: 'spoiler', description: 'Plot revealed', status: 'pending',
  resolved_by: null, resolved_at: null, resolution_note: null, resolution_action: null, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
  reporter: { id: 9, username: 'reader' }, target_available: true, review }
const meta = { page: 1, per_page: 20, total_pages: 1, total_results: 1 }
beforeEach(() => vi.restoreAllMocks())

function screen(path: string, item: Report = report, status: 'active' | 'restricted' = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(authKey, actor)
  client.setQueryData(accessKey(actor.id), { role: 'moderator', account_status: status })
  client.setQueryData(moderationKeys.reports(actor.id, { page: 1, per_page: 20, status: 'pending' }), { data: [item], meta })
  client.setQueryData(moderationKeys.report(actor.id, item.id), item)
  client.setQueryData(moderationKeys.reviews(actor.id, { page: 1, per_page: 20, visibility: '', tmdb_id: '' }), { data: [review], meta })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={{ role: 'moderator', account_status: status }} />}>
      <Route path="/admin/reports" element={<ReportsPage />} /><Route path="/admin/reports/:id" element={<ReportDetailsPage />} />
      <Route path="/admin/reviews" element={<ModerationReviewsPage />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

it('shows report action for another author and clear dialog copy', () => {
  const card = renderToStaticMarkup(<ReviewCard review={{ ...review, author: { ...review.author!, avatar_url: null } }} onReport={() => {}} />)
  expect(card).toContain('Report review by writer')
  const dialog = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><ReportReviewDialog review={{ ...review, author: { ...review.author!, avatar_url: null } }} owner={8} onClose={() => {}} onDone={() => {}} /></QueryClientProvider>)
  expect(dialog).toContain('does not automatically remove a review')
  expect(dialog).toContain('Unmarked spoilers')
})

it('renders moderator navigation, report queue, detail, missing target and restricted actions', () => {
  expect(screen('/admin/reports')).toContain('Investigate')
  expect(screen('/admin/reports')).not.toContain('/admin/users')
  expect(screen('/admin/reports/4')).toContain('Plot revealed')
  expect(screen('/admin/reports/4', { ...report, target_available: false, review: undefined })).toContain('This review is no longer available')
  expect(screen('/admin/reports/4', report, 'restricted')).toContain('cannot make moderation changes')
  expect(screen('/admin/reviews')).toContain('A reported review')
})

it('keys private pages by owner and filters', () => {
  const filters = { page: 1, per_page: 20, status: 'pending' as const }
  expect(moderationKeys.reports(8, filters)).not.toEqual(moderationKeys.reports(9, filters))
  expect(moderationKeys.reports(8, filters)).not.toEqual(moderationKeys.reports(8, { ...filters, status: 'resolved' }))
  expect(moderationKeys.report(8, 4)).not.toEqual(moderationKeys.report(8, 5))
})

it('uses bounded cancellable reads and CSRF before writes', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [report], meta } })
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 4, status: 'pending' } }, status: 201 })
  const signal = new AbortController().signal
  await reports({ page: 2, per_page: 20, status: 'pending' }, signal)
  expect(get).toHaveBeenCalledWith('/api/v1/admin/reports', { params: { page: 2, per_page: 20, status: 'pending' }, signal })
  expect(await submitReport(550, 12, { reason: 'spoiler' }, () => true)).toEqual({ report: { id: 4, status: 'pending' }, created: true })
  expect(post).toHaveBeenCalledWith('/api/v1/movies/550/reviews/12/reports', { reason: 'spoiler' })
  post.mockResolvedValueOnce({ data: { data: { id: 4, status: 'pending' } }, status: 200 })
  expect((await submitReport(550, 12, { reason: 'spam' }, () => true)).created).toBe(false)
  await changeModeration({ kind: 'resolve', id: 4, values: { action: 'hide', reason: 'Violation' }, movie: 550 }, () => true)
  expect(post).toHaveBeenCalledWith('/api/v1/admin/reports/4/resolve', { action: 'hide', reason: 'Violation' })
})

it('blocks stale-account writes and reports specific errors', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({})
  const post = vi.spyOn(api, 'post')
  await expect(submitReport(550, 12, { reason: 'spam' }, () => false)).rejects.toThrow('account changed')
  await expect(changeModeration({ kind: 'dismiss', id: 4, values: { reason: 'No issue' } }, () => false)).rejects.toThrow('account changed')
  expect(post).not.toHaveBeenCalled()
  expect(moderationError({ isAxiosError: true, response: { status: 409, data: { message: 'Target unavailable.' } } })).toContain('Target unavailable')
})
