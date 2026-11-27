import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Input } from '../../../components/ui/Input'
import { MovieState } from '../../movies/components/MovieState'
import { movieNightError } from '../api/errors'
import { useMovieNightMutation, useMovieNightQuery } from '../hooks/useMovieNights'
import { invitationSearch } from '../lib/invitationSearch'
import type { MovieNight } from '../types/movieNight.types'

export function MovieNightParticipants({ night, roster, invite }: { night: MovieNight; roster: boolean; invite: boolean }) {
  const [open, setOpen] = useState(false)
  if (open && !invite) setOpen(false)
  return <section className="night-participants" aria-labelledby="night-participants">
    <div className="night-toolbar"><div><h2 id="night-participants">Participants</h2><p>The host brings everyone together.</p></div>{invite && <Button onClick={() => setOpen(true)}>Invite people</Button>}</div>
    <div className="night-person"><Avatar username={night.host.username} url={night.host.avatar_url} /><strong>@{night.host.username}</strong><span className="night-relationship">Host</span></div>
    {roster ? <ParticipantRoster id={night.id} /> : <p className="night-private-note">The guest list is managed by the host.</p>}
    {open && invite && <InvitationDialog id={night.id} onClose={() => setOpen(false)} />}
  </section>
}
function ParticipantRoster({ id }: { id: number }) {
  const [page, setPage] = useState(1)
  const result = useMovieNightQuery({ kind: 'roster', id, page: { page, per_page: 12 } })
  return result.isPending ? <p role="status">Loading participants…</p> : result.isError ? <MovieState title="Participants unavailable." retry={() => void result.refetch()}>{movieNightError(result.error).message}</MovieState> : <>
    {result.data.data.length ? <ul className="night-people" aria-label="Invited participants">{result.data.data.map(person => <li className="night-person" key={person.id}>
      <Avatar username={person.participant.username} url={person.participant.avatar_url} /><div><strong>@{person.participant.username}</strong>{person.responded_at && <small>Responded <time dateTime={person.responded_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(person.responded_at))}</time></small>}</div><span className={`night-relationship is-${person.rsvp_status}`}>{person.rsvp_status[0].toUpperCase() + person.rsvp_status.slice(1)}</span>
    </li>)}</ul> : <p className="night-private-note">{page > 1 ? 'No participants on this page.' : 'No invitations yet. Start with someone who loves a good film.'}</p>}
    <PeoplePagination page={page} total={result.data.meta.total_pages} onChange={setPage} label="Participant pages" />
  </>
}
function PeoplePagination({ page, total, onChange, label, busy = false }: { page: number; total: number; onChange: (page: number) => void; label: string; busy?: boolean }) {
  return (total > 1 || page > 1) && <nav className="night-people-pagination" aria-label={label}><Button disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>Previous</Button><span>Page {page}</span><Button disabled={page >= Math.min(10000, total) || busy} onClick={() => onChange(page + 1)}>Next</Button></nav>
}
function InvitationDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [input, setInput] = useState(''), [settled, setSettled] = useState(''), [page, setPage] = useState(1)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [sent, setSent] = useState<number[]>([])
  const mutation = useMovieNightMutation(), submitting = useRef(false), mounted = useRef(true)
  const search = invitationSearch(input), ready = search.valid && search.query === settled
  useEffect(() => { mounted.current = true; document.querySelector<HTMLInputElement>('#night-username')?.focus(); return () => { mounted.current = false } }, [])
  useEffect(() => { const timer = window.setTimeout(() => setSettled(search.query), 350); return () => window.clearTimeout(timer) }, [search.query])
  const results = useMovieNightQuery({ kind: 'eligibleUsers', id, query: settled, page: { page, per_page: 12 } }, ready)
  const busy = mutation.isPending
  return <Dialog title="Invite people" onClose={onClose} busy={busy} className="night-invite-dialog">
    <p className="night-dialog-copy">Find people by username. Invitations only share the event title, organizer and schedule until accepted.</p>
    <Input id="night-username" label="Search username" value={input} disabled={busy} autoComplete="off" spellCheck={false} hint="3–30 letters, numbers or underscores. Prefix search." error={input && !search.valid ? 'Enter 3–30 letters, numbers or underscores.' : undefined} onChange={event => { setInput(event.target.value); setPage(1); setError(''); setNotice('') }} />
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status" className="night-notice">{notice}</p>}
    {!search.valid ? <p className="night-private-note">Search for someone to invite.</p> : !ready || results.isPending ? <p role="status">Searching usernames…</p> : results.isError ? <MovieState title="Search unavailable." retry={() => void results.refetch()}>{movieNightError(results.error).message}</MovieState> : <>
      {results.data.data.length ? <ul className="night-people" aria-label="Eligible people">{results.data.data.map(person => <li className="night-person" key={person.id}><Avatar username={person.username} url={person.avatar_url} /><strong>@{person.username}</strong><Button disabled={busy || sent.includes(person.id)} aria-label={`Invite @${person.username}`} onClick={async () => {
        if (submitting.current || sent.includes(person.id)) return
        submitting.current = true; setError(''); setNotice('')
        try { const result = await mutation.mutateAsync({ kind: 'invite', id, invitedUserId: person.id }); if (mounted.current && result && 'participant' in result) { setSent(previous => [...previous, result.participant.id]); setNotice('Invitation sent. Results and participants are refreshing.') } }
        catch (failure) { if (mounted.current) { const info = movieNightError(failure); setError(info.fields.invited_user_id?.[0] ?? info.message) } }
        finally { submitting.current = false }
      }}>Invite</Button></li>)}</ul> : <p className="night-private-note">No eligible people match this username.</p>}
      <PeoplePagination page={page} total={results.data.meta.total_pages} onChange={setPage} busy={busy} label="Username search pages" />
    </>}
  </Dialog>
}
