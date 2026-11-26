import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { MovieState } from '../../movies/components/MovieState'
import { movieNightError } from '../api/errors'
import { MovieNightParticipants } from '../components/MovieNightParticipants'
import { MovieNightRsvp } from '../components/MovieNightRsvp'
import { CancelMovieNightDialog, EditMovieNightDialog } from '../components/MovieNightManagement'
import { useMovieNightQuery } from '../hooks/useMovieNights'
import { useNightBoundary, useNightClock } from '../hooks/useNightBoundary'
import { nightRouteId, safeMeetingUrl } from '../lib/eventForm'
import { schedulePreview } from '../lib/dateTime'
import { nightPermissions, nightRelationship } from '../lib/permissions'
import '../movie-nights.css'

export default function MovieNightDetailPage() {
  const { nightId } = useParams(), auth = useAuth()
  const id = nightRouteId(nightId)
  if (!id) return <UnavailableNight />
  return <DetailContent key={`${auth.data?.id}:${auth.data?.email_verified_at}:${id}`} owner={auth.data?.id ?? 0} id={id} />
}
function UnavailableNight() {
  return <MovieState title="Movie night unavailable.">This movie night cannot be displayed. <Link to="/movie-nights">Return to Movie Nights</Link></MovieState>
}
function DetailContent({ owner, id }: { owner: number; id: number }) {
  const auth = useAuth()
  const access = useAccess(owner, !!auth.data?.email_verified_at)
  const boundary = useNightBoundary(owner, id)
  const allowed = boundary.isCurrent()
  const result = useMovieNightQuery({ kind: 'detail', id }, allowed)
  const [dialog, setDialog] = useState<'edit' | 'cancel' | null>(null)
  const now = useNightClock(result.data?.starts_at)
  const night = result.data
  const permission = nightPermissions(auth.data, access.data, night, now)
  let schedule = 'Schedule unavailable', scheduleReady = false
  if (night) {
    try { schedule = schedulePreview(night.starts_at, night.timezone); scheduleReady = true } catch { /* Keep unsupported schedules read-only. */ }
  }
  const visible = allowed && !access.isError && !result.isError && night?.my_rsvp === 'accepted'
  const canEdit = visible && permission.edit && scheduleReady
  const canCancel = visible && permission.cancel
  // Clear this component's selection before committing a render with lost permission.
  // Restoration then requires a new click, never resurrection of an old selection/draft.
  if (dialog === 'edit' && !canEdit || dialog === 'cancel' && !canCancel) setDialog(null)
  if (!allowed || access.data && !nightPermissions(auth.data, access.data).read) return <UnavailableNight />
  if (access.isError) return <MovieState title="Movie night unavailable." retry={() => void access.refetch()}>We couldn’t check your account access.</MovieState>
  if (result.isError) {
    const error = movieNightError(result.error)
    return [401, 403, 404].includes(error.status ?? 0) ? <UnavailableNight /> : <MovieState title="Your movie night is taking an intermission." retry={() => void result.refetch()}>{error.message}</MovieState>
  }
  if (!night || result.isPending || !access.data) return <MovieState title="Loading your movie night…">Getting the details together.</MovieState>
  if (night.my_rsvp !== 'accepted') return <UnavailableNight />
  const relationship = nightRelationship(night, owner)
  const meeting = safeMeetingUrl(night.meeting_url)
  return <section className="movie-nights-page night-detail">
    <Link className="text-link night-back" to="/movie-nights">← Movie Nights</Link>
    <div className="night-heading"><div><p className="eyebrow">Your shared screening</p><h1>{night.title}<span className="accent-period">.</span></h1><div className="night-detail-labels"><span className={`night-status is-${night.status}`}>{night.status[0].toUpperCase() + night.status.slice(1)}</span><span className="night-relationship">{relationship === 'host' ? 'Hosting' : 'Going'}</span></div></div>
      {(canEdit || canCancel) && <div className="night-detail-actions">{canEdit && <Button onClick={() => setDialog('edit')}>Edit movie night</Button>}{canCancel && <Button className="destructive" onClick={() => setDialog('cancel')}>Cancel movie night</Button>}</div>}
    </div>
    {(night.status !== 'scheduled' || access.data.account_status === 'restricted' || !permission.edit && relationship === 'host') && <p className="night-notice" role="status">{night.status !== 'scheduled' ? `This movie night is ${night.status}. Details are read-only.` : access.data.account_status === 'restricted' ? 'Your account is restricted. You can view this movie night but cannot make changes.' : 'The scheduled start has been reached on this device. Editing is closed; the server checks every action.'}</p>}
    <div className="night-detail-panel"><div className="night-organizer"><Avatar username={night.host.username} url={night.host.avatar_url} /><span>Organized by <strong>@{night.host.username}</strong></span></div><dl className="night-details-list"><div><dt>Scheduled screening</dt><dd><time dateTime={night.starts_at}>{schedule}</time></dd></div>{night.location && <div><dt>Physical location</dt><dd>{night.location}</dd></div>}{night.meeting_url && <div><dt>Meeting link</dt><dd>{meeting ? <a href={meeting} target="_blank" rel="noopener noreferrer">{meeting}<span className="sr-only"> (opens in a new tab)</span></a> : 'Meeting link unavailable'}</dd></div>}</dl><p className="night-private-note">These details are private to the host and accepted guests.</p></div>
    <MovieNightRsvp night={night} detail />
    <MovieNightParticipants night={night} roster={visible && permission.roster} invite={visible && permission.invite} />
    <div className="night-future-sections">{[['shortlist', 'Shared shortlist', 'A place for everyone’s movie suggestions is coming soon.'], ['voting', 'Voting', 'Your group’s movie vote will be available here soon.']].map(([key, title, copy]) => <section key={key} aria-labelledby={`night-${key}`}><h2 id={`night-${key}`}>{title}</h2><p>{copy}</p></section>)}</div>
    {dialog === 'edit' && canEdit && <EditMovieNightDialog night={night} onClose={() => setDialog(null)} />}
    {dialog === 'cancel' && canCancel && <CancelMovieNightDialog id={id} onClose={() => setDialog(null)} />}
  </section>
}
