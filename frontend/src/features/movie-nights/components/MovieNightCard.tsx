import { Link } from 'react-router-dom'
import { MovieNightRsvp } from './MovieNightRsvp'
import { Avatar } from '../../../components/ui/Avatar'
import { schedulePreview, utcToLocal } from '../lib/dateTime'
import { nightRelationship } from '../lib/permissions'
import type { NightSummary, Rsvp } from '../types/movieNight.types'

const relationships = { host: 'Hosting', accepted: 'Going', pending: 'Invited', declined: 'Declined' }
const statuses = { scheduled: 'Scheduled', finalized: 'Finalized', cancelled: 'Cancelled' }
const responses = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' }
export function MovieNightCard({ night, owner, rsvp }: { night: NightSummary; owner: number; rsvp?: Rsvp }) {
  const relationship = nightRelationship(night, owner)
  let date: string | undefined, time: string | undefined, preview: string | undefined
  try {
    const local = utcToLocal(night.starts_at, night.timezone)
    date = new Intl.DateTimeFormat(undefined, { timeZone: night.timezone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(night.starts_at))
    time = `${local.slice(11, 16)} · ${night.timezone}`
    preview = schedulePreview(night.starts_at, night.timezone)
  } catch { /* Keep the summary usable if the runtime cannot interpret its timezone. */ }
  return <li className="night-card">
    <div className="night-card-top"><span className={`night-relationship is-${relationship}`}>{relationships[relationship]}</span><span className={`night-status is-${night.status}`}>{statuses[night.status]}</span></div>
    <h3>{night.title}</h3>
    <div className="night-organizer"><Avatar username={night.host.username} url={night.host.avatar_url} /><span>Organized by <strong>@{night.host.username}</strong></span></div>
    <div className="night-schedule"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v6m10-6v6M3 11h18" /></svg>
      {date ? <time dateTime={night.starts_at} title={preview}><strong>{date}</strong><span>{time}</span></time> : <span>Schedule unavailable</span>}
    </div>
    <div className="night-card-bottom">{relationship === 'host' || relationship === 'accepted'
      ? <Link className="text-link" to={`/movie-nights/${night.id}`} aria-label={`View ${night.title}`}>View movie night <span aria-hidden="true">↗</span></Link>
      : <span className="night-private-note">Details available after accepting.</span>}
      {rsvp && <span className="night-rsvp">RSVP: {responses[rsvp]}</span>}
    </div>
    <MovieNightRsvp key={`${owner}:${night.id}`} night={night} />
  </li>
}
