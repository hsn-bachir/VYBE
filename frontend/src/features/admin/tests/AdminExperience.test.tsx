import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { RequireAdministrator } from '../../auth/guards/AuthGuards'
import { moderationKeys } from '../../moderation/hooks/useModeration'
import { ModerationActionDialog } from '../../moderation/components/ModerationActionDialog'
import ModerationReviewsPage from '../../moderation/pages/ModerationReviewsPage'
import AdminPage from '../pages/AdminPage'
import AdminMovieInsightsPage from '../pages/AdminMovieInsightsPage'
import { adminMovieInsights, type AdminMovieInsights } from '../api/adminMovieInsightsApi'
import { movieInsightsKey } from '../hooks/useAdminMovieInsights'

const actor = { id: 5, username: 'operator', email: 'operator@example.test', avatar_url: null, email_verified_at: '2026-11-03T00:00:00Z' }
const overview = { pending_reports: 3, handled_reports: 8, hidden_reviews: 2, enforced_spoilers: 1,
  recent_reports: [{ id: 9, review_id: 4, reason: 'spoiler' as const, status: 'pending' as const, created_at: '2026-11-05T00:00:00Z' }],
  users: { total: 20, restricted: 1, banned: 2, deactivated: 0 },
  activity: { total_reviews: 14, total_ratings: 37, total_watched_entries: 89 } }
const review = { id: 4, tmdb_id: 550, author: { id: 7, username: 'writer' }, body_preview: 'A short review',
  visibility: 'visible', author_contains_spoilers: false, moderator_spoiler: false, contains_spoilers: false,
  pending_report_count: 2, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' }
const page = { data: [review], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1 } }

const movie = { title: 'The Quiet Horizon', poster_path: '/horizon.jpg', release_date: '2025-01-01' }
const insights: AdminMovieInsights = { data: {
  most_watched: [{ tmdb_id: 550, watched_users: 12, movie }, { tmdb_id: 551, watched_users: 1, movie: null }],
  highest_rated: [{ tmdb_id: 550, average_rating: 4.8, rating_count: 17, movie }],
}, meta: { metadata_unavailable: false } }

function render(path: string, role: 'admin' | 'moderator', rankings?: AdminMovieInsights) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(authKey, actor)
  // A moderator must never see administrator values, even with a cached pre-demotion response.
  client.setQueryData(moderationKeys.overview(actor.id), overview)
  if (rankings) client.setQueryData(movieInsightsKey(actor.id), rankings)
  for (const scope of ['needs_attention', 'actioned', 'all'] as const) {
    client.setQueryData(moderationKeys.reviews(actor.id, { page: 1, per_page: 20, visibility: '', tmdb_id: '', scope, actioned_type: '' }), page)
  }
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={{ role, account_status: 'active' }} />}>
      <Route path="/admin" element={<AdminPage />} /><Route path="/admin/reviews" element={<ModerationReviewsPage />} />
      <Route element={<RequireAdministrator />}><Route path="/admin/movie-insights" element={<AdminMovieInsightsPage />} /></Route>
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('compact administration experience', () => {
  it('renders real overview counts and hides user management from moderators', () => {
    const admin = render('/admin', 'admin')
    expect(admin).toContain('Pending reports')
    expect(admin).toContain('Total users')
    expect(admin).toContain('<strong>14</strong><span>Total reviews</span>')
    expect(admin).toContain('<strong>37</strong><span>Total VYBE ratings</span>')
    expect(admin).toContain('<strong>89</strong><span>Total watched entries</span>')
    expect(admin).toContain('Review #4')
    expect(admin).toContain('/admin/users')
    expect(admin).toContain('/admin/movie-insights')
    const moderator = render('/admin', 'moderator')
    expect(moderator).toContain('Moderation overview')
    expect(moderator).not.toContain('Total users')
    expect(moderator).not.toContain('Total reviews')
    expect(moderator).not.toContain('/admin/users')
    expect(moderator).not.toContain('/admin/movie-insights')
    expect(moderator).toContain('admin-mobile-menu')
  })

  it('renders bounded movie rankings with links, VYBE ratings and missing movie fallbacks', () => {
    const html = render('/admin/movie-insights', 'admin', insights)
    expect(html).toContain('Most Watched Movies')
    expect(html).toContain('Highest Rated Movies')
    expect(html).toContain('VYBE community ratings')
    expect(html).toMatch(/href="\/movies\/550"[^>]*>The Quiet Horizon/)
    expect(html).toContain('<span>2025</span>')
    expect(html).toContain('<strong>12</strong><span>viewers</span>')
    expect(html).toContain('4.80 <small>/ 5</small>')
    expect(html).toContain('17 ratings')
    expect(html).toMatch(/href="\/movies\/551"[^>]*>Movie #551/)
    expect(html).toContain('<strong>1</strong><span>viewer</span>')
    expect(html).not.toContain('/ 10')
    expect(render('/admin/movie-insights', 'moderator', insights)).toContain('Access denied')
    expect(render('/admin/movie-insights', 'moderator', insights)).not.toContain('The Quiet Horizon')
  })

  it('renders loading, empty and metadata outage states', () => {
    const loading = render('/admin/movie-insights', 'admin')
    expect(loading).toContain('Loading most watched movies')
    expect(loading).toContain('Loading highest rated movies')
    const empty = render('/admin/movie-insights', 'admin', { ...insights, data: { most_watched: [], highest_rated: [] } })
    expect(empty).toContain('No movies have been marked as watched yet.')
    expect(empty).toContain('No VYBE community ratings yet.')
    const outage = render('/admin/movie-insights', 'admin', { ...insights, meta: { metadata_unavailable: true } })
    expect(outage).toContain('Retry movie details')
    expect(outage).toContain('17 ratings')
  })

  it('scopes movie insights cache entries and forwards request cancellation', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: insights })
    const { signal } = new AbortController()
    try {
      expect(movieInsightsKey(5)).not.toEqual(movieInsightsKey(6))
      await expect(adminMovieInsights(signal)).resolves.toEqual(insights)
      expect(spy).toHaveBeenCalledWith('/api/v1/admin/movie-insights', { signal })
    } finally {
      spy.mockRestore()
    }
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
