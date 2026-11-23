import type { ActivityMetric } from '../api/adminAnalyticsApi'

export type ActivitySeries = { key: ActivityMetric; label: string; totalLabel: string }

export const activityMetrics: ActivitySeries[] = [
  { key: 'registrations', label: 'Registrations', totalLabel: 'New registrations' },
  { key: 'reviews', label: 'Reviews', totalLabel: 'New reviews' },
  { key: 'ratings', label: 'Ratings', totalLabel: 'New rating records' },
  { key: 'watched_entries', label: 'Watched entries', totalLabel: 'New watched entries' },
]
