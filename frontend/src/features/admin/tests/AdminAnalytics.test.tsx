import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { RequireAdministrator } from '../../auth/guards/AuthGuards'
import { authKey } from '../../auth/hooks/useAuth'
import { adminActivityAnalytics, adminGenreInsights, type ActivityAnalytics, type GenreInsights } from '../api/adminAnalyticsApi'
import { activityAnalyticsKey, genreInsightsKey } from '../hooks/useAdminAnalytics'
import AdminActivityAnalyticsPage from '../pages/AdminActivityAnalyticsPage'
import AdminMovieInsightsPage from '../pages/AdminMovieInsightsPage'

const actor = { id: 5, username: 'operator', email: 'operator@example.test', avatar_url: null, email_verified_at: '2026-11-03T00:00:00Z' }
const genres: GenreInsights = {
  data: [{ genre_id: 18, name: 'Drama', watched_entries: 42 }, { genre_id: 53, name: 'Thriller', watched_entries: 21 }],
  meta: { cohort_limit: 50, total_watched_movies: 67, total_watched_entries: 150, cohort_movies: 50, cohort_watched_entries: 130,
    covered_movies: 37, covered_watched_entries: 110, metadata_unavailable: false },
}
const zeroCounts = { registrations: 0, reviews: 0, ratings: 0, watched_entries: 0 }
const activity: ActivityAnalytics = {
  range_days: 30, timezone: 'UTC', start_date: '2026-10-25', end_date: '2026-11-23',
  days: Array.from({ length: 30 }, (_, i) => ({ ...zeroCounts, date: new Date(Date.UTC(2026, 9, 25 + i)).toISOString().slice(0, 10), registrations: i === 29 ? 8 : 0 })),
  totals: { ...zeroCounts, registrations: 8, reviews: 15, watched_entries: 12 }, active_contributors: 6,
}

function render(path: string, { role = 'admin', genreData, activityData }: {
  role?: 'moderator' | 'admin'; genreData?: GenreInsights; activityData?: ActivityAnalytics
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(authKey, actor)
  if (genreData) client.setQueryData(genreInsightsKey(actor.id), genreData)
  if (activityData) client.setQueryData(activityAnalyticsKey(actor.id, 30), activityData)
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={{ role, account_status: 'active' }} />}><Route element={<RequireAdministrator />}>
      <Route path="/admin/movie-insights" element={<AdminMovieInsightsPage />} />
      <Route path="/admin/activity-analytics" element={<AdminActivityAnalyticsPage />} />
    </Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('administrator analytics', () => {
  it('renders a relative genre ranking and coverage while movie rankings are loading', () => {
    const html = render('/admin/movie-insights', { genreData: genres })
    expect(html).toContain('Loading most watched movies')
    expect(html).toContain('Popular Genres')
    expect(html).toContain('Up to 50 most-watched movies')
    expect(html).toContain('37 of 50 movies')
    expect(html).toContain('110 of 130 watched entries')
    expect(html).toContain('Some movies are missing cached genre data')
    expect(html.indexOf('Drama')).toBeLessThan(html.indexOf('Thriller'))
    expect(html).toContain('width:50%')
  })

  it('distinguishes no activity, missing cached genres and a genre service outage', () => {
    expect(render('/admin/movie-insights')).toContain('Loading popular genres')
    const missing = { ...genres, data: [], meta: { ...genres.meta, covered_movies: 0, covered_watched_entries: 0 } }
    expect(render('/admin/movie-insights', { genreData: missing })).toContain('Cached genre data is missing for every movie')
    expect(render('/admin/movie-insights', { genreData: { ...missing, meta: { ...genres.meta } } })).toContain('No genres are available to rank')
    expect(render('/admin/movie-insights', { genreData: { ...missing, meta: { ...missing.meta, metadata_unavailable: true } } })).toContain('Retry genre metadata')
    expect(render('/admin/movie-insights', { genreData: { ...missing, meta: { ...missing.meta, cohort_movies: 0 } } })).toContain('No watched entries to rank')
  })

  it('renders the selected range totals, unique contributors and a keyboard-addressable UTC chart', () => {
    const html = render('/admin/activity-analytics', { activityData: activity })
    expect(html).toContain('aria-label="Totals for the last 30 days"')
    expect(html).toContain('<strong>15</strong><span>New reviews</span>')
    expect(html).toContain('aria-label="Active Contributors for the last 30 days"')
    expect(html).toContain('<strong>6</strong> <span>Active Contributors</span>')
    expect(html).toContain('aria-pressed="true">Last 30 days')
    expect(html).toContain('aria-pressed="false">Last 90 days')
    expect(html).toContain('Inspect day')
    expect(html).toContain('UTC, 8 registrations')
    expect(html).toContain('grid-template-columns:repeat(30, minmax(0, 1fr))')
    expect(render('/admin/activity-analytics')).toContain('Loading activity analytics')
    const empty = { ...activity, days: activity.days.map(day => ({ ...day, registrations: 0 })) }
    expect(render('/admin/activity-analytics', { activityData: empty })).toContain('No registrations recorded in this range')
    const moderator = render('/admin/activity-analytics', { role: 'moderator', activityData: activity })
    expect(moderator).toContain('Access denied')
    expect(moderator).not.toContain('Active Contributors')
  })

  it('uses independent owner- and range-scoped keys and cancellable API reads', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: genres }).mockResolvedValueOnce({ data: { data: activity } })
    const { signal } = new AbortController()
    try {
      expect(genreInsightsKey(5)).not.toEqual(genreInsightsKey(6))
      expect(activityAnalyticsKey(5, 7)).not.toEqual(activityAnalyticsKey(5, 90))
      await expect(adminGenreInsights(signal)).resolves.toEqual(genres)
      await expect(adminActivityAnalytics(30, signal)).resolves.toEqual(activity)
      expect(get).toHaveBeenNthCalledWith(1, '/api/v1/admin/genre-insights', { signal })
      expect(get).toHaveBeenNthCalledWith(2, '/api/v1/admin/activity-analytics', { params: { range: 30 }, signal })
    } finally {
      get.mockRestore()
    }
  })
})
