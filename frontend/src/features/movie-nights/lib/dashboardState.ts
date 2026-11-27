import type { NightStatus } from '../types/movieNight.types'

export const nightStatusFilters = ['all', 'scheduled', 'finalized', 'cancelled'] as const
export type NightStatusFilter = 'all' | NightStatus
export type DashboardView = 'nights' | 'invitations'
export function dashboardState(params: URLSearchParams) {
  const view = params.get('view') ?? 'nights'
  const status = params.get('status') ?? 'all'
  const rawPage = params.get('page') ?? '1'
  const valid = ['nights', 'invitations'].includes(view) && nightStatusFilters.includes(status as NightStatusFilter)
    && /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 10000
  return { view: view === 'invitations' ? 'invitations' as const : 'nights' as const,
    status: nightStatusFilters.includes(status as NightStatusFilter) ? status as NightStatusFilter : 'all' as const,
    page: valid ? Number(rawPage) : 1, valid }
}
export function dashboardTarget(params: URLSearchParams, change: { view?: DashboardView; status?: NightStatusFilter; page?: number }) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(change)) next.set(key, String(value))
  if (change.view !== undefined || change.status !== undefined) next.delete('page')
  if (next.get('page') === '1') next.delete('page')
  return `/movie-nights${next.size ? `?${next}` : ''}`
}
