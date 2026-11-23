import { api } from '../../../lib/api/client'

export type GenreInsights = {
  data: { genre_id: number; name: string; watched_entries: number }[]
  meta: {
    cohort_limit: number
    total_watched_movies: number
    total_watched_entries: number
    cohort_movies: number
    cohort_watched_entries: number
    covered_movies: number
    covered_watched_entries: number
    metadata_unavailable: boolean
  }
}

export type ActivityRange = 7 | 30 | 90
export type ActivityMetric = 'registrations' | 'reviews' | 'ratings' | 'watched_entries'
type Counts = Record<ActivityMetric, number>
export type ActivityDay = Counts & { date: string }
export type ActivityAnalytics = {
  range_days: ActivityRange
  timezone: 'UTC'
  start_date: string
  end_date: string
  days: ActivityDay[]
  totals: Counts
  active_contributors: number
}

export async function adminGenreInsights(signal?: AbortSignal): Promise<GenreInsights> {
  return (await api.get<GenreInsights>('/api/v1/admin/genre-insights', { signal })).data
}

export async function adminActivityAnalytics(range: ActivityRange, signal?: AbortSignal): Promise<ActivityAnalytics> {
  return (await api.get<{ data: ActivityAnalytics }>('/api/v1/admin/activity-analytics', { params: { range }, signal })).data.data
}
