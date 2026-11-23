import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { moderationError } from '../../moderation/api/moderationApi'
import type { ActivityRange } from '../api/adminAnalyticsApi'
import { AdminActivityChart } from '../components/AdminActivityChart'
import { activityMetrics } from '../components/adminActivityMetrics'
import { AdminNotice, AdminShell } from '../components/AdminShell'
import { useAdminActivityAnalytics } from '../hooks/useAdminAnalytics'

const ranges: ActivityRange[] = [7, 30, 90]

export default function AdminActivityAnalyticsPage() {
  const [range, setRange] = useState<ActivityRange>(30)
  const [series, setSeries] = useState(activityMetrics[0])
  const query = useAdminActivityAnalytics(useAuth().data?.id ?? 0, range)
  const result = query.data

  return <AdminShell>
    <div className="admin-heading"><div><h1>Activity Analytics</h1><p>New activity from records still stored in VYBE, grouped by UTC day.</p></div></div>
    <div className="admin-analytics-options" role="group" aria-label="Reporting range">
      {ranges.map(days => <Button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days)}>Last {days} days</Button>)}
    </div>
    {query.isPending ? <div role="status" aria-label="Loading activity analytics">
      <div className="admin-stats">{activityMetrics.map(({ key }) => <div key={key} className="admin-stat skeleton" aria-hidden="true" />)}</div>
      <div className="admin-analytics-plot-skeleton skeleton" aria-hidden="true" />
    </div> : query.isError ? <div className="admin-insights-feedback admin-analytics-feedback">
      <AdminNotice error>{moderationError(query.error)}</AdminNotice>
      <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Retry activity analytics</Button>
    </div> : result && <>
      <div className="admin-stats" aria-label={`Totals for the last ${result.range_days} days`} role="group">
        {activityMetrics.map(({ key, totalLabel }) => <div className="admin-stat" key={key}>
          <strong>{result.totals[key].toLocaleString()}</strong><span>{totalLabel}</span>
        </div>)}
      </div>
      <AdminActivityChart key={`${result.start_date}:${result.end_date}`} days={result.days} series={series} onSeriesChange={setSeries} />
      <div className="admin-activity-contributors" role="group" aria-label={`Active Contributors for the last ${result.range_days} days`}>
        <p><strong>{result.active_contributors.toLocaleString()}</strong> <span>Active Contributors</span></p>
        <p className="admin-hint">Members who created at least one retained review, rating, or watched entry in this range.</p>
      </div>
    </>}
  </AdminShell>
}
