import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { authKey } from '../../auth/hooks/useAuth'
import { moderationKeys } from '../../moderation/hooks/useModeration'
import { ModerationActionDialog } from '../../moderation/components/ModerationActionDialog'
import ModerationReviewsPage from '../../moderation/pages/ModerationReviewsPage'
import AdminPage from '../pages/AdminPage'

const actor = { id: 5, username: 'operator', email: 'operator@example.test', avatar_url: null, email_verified_at: '2026-11-03T00:00:00Z' }
const overview = { pending_reports: 3, handled_reports: 8, hidden_reviews: 2, enforced_spoilers: 1,
  recent_reports: [{ id: 9, review_id: 4, reason: 'spoiler' as const, status: 'pending' as const, created_at: '2026-11-05T00:00:00Z' }],
  users: { total: 20, restricted: 1, banned: 2, deactivated: 0 } }
const review = { id: 4, tmdb_id: 550, author: { id: 7, username: 'writer' }, body_preview: 'A short review',
  visibility: 'visible', author_contains_spoilers: false, moderator_spoiler: false, contains_spoilers: false,
  pending_report_count: 2, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' }
const page = { data: [review], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1 } }

function render(path: string, role: 'admin' | 'moderator') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(authKey, actor)
  client.setQueryData(moderationKeys.overview(actor.id), role === 'admin' ? overview : { ...overview, users: undefined })
  for (const scope of ['needs_attention', 'actioned', 'all'] as const) {
    client.setQueryData(moderationKeys.reviews(actor.id, { page: 1, per_page: 20, visibility: '', tmdb_id: '', scope, actioned_type: '' }), page)
  }
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={{ role, account_status: 'active' }} />}>
      <Route path="/admin" element={<AdminPage />} /><Route path="/admin/reviews" element={<ModerationReviewsPage />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('compact administration experience', () => {
  it('renders real overview counts and hides user management from moderators', () => {
    const admin = render('/admin', 'admin')
    expect(admin).toContain('Pending reports')
    expect(admin).toContain('Total users')
    expect(admin).toContain('Review #4')
    expect(admin).toContain('/admin/users')
    const moderator = render('/admin', 'moderator')
    expect(moderator).toContain('Moderation overview')
    expect(moderator).not.toContain('Total users')
    expect(moderator).not.toContain('/admin/users')
    expect(moderator).toContain('admin-mobile-menu')
  })

  it('shows a compact review table, URL scoped views and a pending-report path', () => {
    const needs = render('/admin/reviews', 'moderator')
    expect(needs).toContain('<table')
    expect(needs).toContain('A short review')
    expect(needs).toContain('2 pending')
    expect(needs).toContain('/admin/reports?target_id=4')
    expect(needs).toContain('Search movies by title')
    expect(needs).toContain('aria-pressed="true">Needs Attention')
    const actioned = render('/admin/reviews?scope=actioned', 'moderator')
    expect(actioned).toContain('Moderation state')
    expect(actioned).toContain('aria-pressed="true">Actioned')
    expect(render('/admin/reviews?scope=all', 'moderator')).toContain('aria-pressed="true">All Reviews')
  })

  it('requires the reason control only for punitive review hiding', () => {
    const common = { title: 'Confirm action', description: 'Recorded in history.', confirmLabel: 'Confirm',
      onClose: () => {}, onConfirm: () => {}, pending: false, error: null }
    const routine = renderToStaticMarkup(<ModerationActionDialog {...common} />)
    const punitive = renderToStaticMarkup(<ModerationActionDialog {...common} reasonRequired />)
    expect(routine).not.toContain('Reason for this decision')
    expect(punitive).toContain('Reason for this decision')
    expect(punitive).toContain('required')
  })
})
