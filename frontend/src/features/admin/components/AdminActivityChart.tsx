import { useState, type KeyboardEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import type { ActivityDay } from '../api/adminAnalyticsApi'
import { activityMetrics, type ActivitySeries } from './adminActivityMetrics'
import './admin-analytics.css'

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`)

export function AdminActivityChart({ days, series, onSeriesChange }: {
  days: ActivityDay[]; series: ActivitySeries; onSeriesChange: (series: ActivitySeries) => void
}) {
  const [selected, setSelected] = useState(days.length - 1)
  const [hovered, setHovered] = useState<number | null>(null)
  const metric = series.key
  const maximum = Math.max(...days.map(day => day[metric]))
  const ceiling = Math.max(2, Math.ceil(maximum / 2) * 2)
  const inspected = days[hovered ?? selected]
  const describeDay = (day: ActivityDay) => `${fullDate.format(utcDate(day.date))} UTC, ${day[metric].toLocaleString()} ${series.label.toLowerCase()}`

  function moveBetweenDays(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const targets: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: days.length - 1 }
    const position = targets[event.key]
    if (position === undefined) return
    event.preventDefault()
    const next = Math.max(0, Math.min(days.length - 1, position))
    event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
  }

  return <section className="admin-panel admin-activity-chart" aria-labelledby="admin-community-activity">
    <h2 id="admin-community-activity">Community Activity</h2>
    <div className="admin-analytics-options" role="group" aria-label="Activity category">
      {activityMetrics.map(option => <Button key={option.key} type="button" aria-pressed={metric === option.key}
        onClick={() => { onSeriesChange(option); setHovered(null) }}>{option.label}</Button>)}
    </div>
    <figure className="admin-activity-figure" aria-label={`${series.label} by date in UTC`}>
      <div className="admin-activity-chart-top">
        <div className="admin-activity-readout" data-testid="activity-readout"><time dateTime={inspected.date}>{fullDate.format(utcDate(inspected.date))} UTC</time>
          <strong>{inspected[metric].toLocaleString()} {series.label.toLowerCase()}</strong>
        </div>
        <label className="admin-activity-date">Inspect day
          <select value={selected} onChange={event => { setSelected(Number(event.target.value)); setHovered(null) }}>
            {days.map((day, index) => <option value={index} key={day.date}>{shortDate.format(utcDate(day.date))}</option>)}
          </select>
        </label>
      </div>
      {maximum === 0 && <p className="admin-hint">No {series.label.toLowerCase()} recorded in this range.</p>}
      <div className="admin-activity-plot">
        <div className="admin-activity-y" aria-hidden="true">{[ceiling, ceiling / 2, 0].map(tick => <span key={tick}>{tick.toLocaleString()}</span>)}</div>
        <div className="admin-activity-bars" role="group" aria-label="Daily counts. Use arrow keys to move between dates."
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} data-dense={days.length > 30}
          onPointerLeave={() => setHovered(null)}>
          {days.map((day, index) => <button key={day.date} type="button" tabIndex={index === selected ? 0 : -1}
            aria-label={describeDay(day)} aria-pressed={index === selected} title={describeDay(day)}
            data-inspected={index === (hovered ?? selected)}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(index) }}
            onFocus={() => { setSelected(index); setHovered(null) }}
            onClick={() => { setSelected(index); setHovered(null) }} onKeyDown={event => moveBetweenDays(event, index)}>
            <span aria-hidden="true" style={{ height: `${day[metric] / ceiling * 100}%` }} />
          </button>)}
        </div>
        <div className="admin-activity-x" aria-hidden="true">
          {[days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]].map(day => <span key={day.date}>{shortDate.format(utcDate(day.date))}</span>)}
        </div>
      </div>
    </figure>
  </section>
}
