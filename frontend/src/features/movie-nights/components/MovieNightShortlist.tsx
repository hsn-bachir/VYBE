import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { movieError } from '../../movies/api/moviesApi'
import { MovieCard } from '../../movies/components/MovieCard'
import { MovieGridSkeleton } from '../../movies/components/MovieGrid'
import { MovieState } from '../../movies/components/MovieState'
import { normalizeQuery, searchOptions } from '../../movies/hooks/useMovies'
import type { MovieSummary } from '../../movies/types/movie.types'
import { movieNightError } from '../api/errors'
import { useMovieNightQuery } from '../hooks/useMovieNights'
import { useNightBoundary, useNightClock } from '../hooks/useNightBoundary'
import { useNightContentCommand } from '../hooks/useNightContentCommand'
import { MovieNightFinalization } from './MovieNightFinalization'
import { canRemoveCandidate, nightPermissions } from '../lib/permissions'
import { asTmdbId, type Candidate, type MovieNight, type VoteTotals } from '../types/movieNight.types'

const unavailableMovie = (candidate: Candidate): MovieSummary => ({ tmdb_id: candidate.tmdb_id, title: `Movie TMDB #${candidate.tmdb_id}`, poster_path: null, backdrop_path: null, overview: null, release_date: null, tmdb_rating: null, tmdb_vote_count: null })
export function MovieNightShortlist({ night }: { night: MovieNight }) {
  const { data: user } = useAuth(), owner = user?.id ?? 0
  const access = useAccess(owner, !!user?.email_verified_at), boundary = useNightBoundary(owner, night.id)
  const now = useNightClock(night.starts_at), permissions = nightPermissions(user, access.data, night, now)
  const read = boundary.isCurrent() && !access.isError && permissions.privateRead
  const [page, setPage] = useState(1), [dialog, setDialog] = useState<'nominate' | Candidate['id'] | null>(null)
  const shortlist = useMovieNightQuery({ kind: 'shortlist', id: night.id, page: { page, per_page: 12 } }, read)
  const votes = useMovieNightQuery({ kind: 'votes', id: night.id }, read)
  const writable = read && permissions.nominate && !votes.isError && votes.data?.voting_open === true
  const command = useNightContentCommand(owner, night.id, writable, dialog)
  const totals = votes.isError ? undefined : votes.data
  const candidate = typeof dialog === 'number' ? shortlist.data?.data.find(item => item.id === dialog) : undefined
  const removable = candidate && read && !shortlist.isError && canRemoveCandidate(user, access.data, night, candidate, totals, now)
  if (dialog !== null && (!writable || dialog !== 'nominate' && !removable)) setDialog(null)
  if (!read) return null
  const busy = command.pending || votes.isFetching || shortlist.isFetching
  const full = (shortlist.data?.meta.total_results ?? 0) >= 50
  return <section className="night-shortlist" aria-labelledby="night-shortlist">
    <MovieNightFinalization night={night} candidates={shortlist.isError ? [] : shortlist.data?.data ?? []} totals={totals} reconciling={votes.isFetching} />
    <div className="night-toolbar"><div><p className="eyebrow">A shared watchlist</p><h2 id="night-shortlist">Shared shortlist</h2><p>Nominate a film. Find your group’s next great story.</p></div>{writable && <Button disabled={command.pending || full} onClick={() => { command.clearError(); setDialog('nominate') }}>Nominate a movie</Button>}</div>
    {full && <p className="night-notice" role="status">The shortlist has reached its 50-movie limit.</p>}
    <section className="night-voting" aria-labelledby="night-voting"><h2 id="night-voting">Voting</h2>
      {votes.isPending ? <p role="status">Loading voting results…</p> : votes.isError ? <MovieState title="Voting results unavailable." retry={() => void votes.refetch()}>{movieNightError(votes.error).message}</MovieState> : <VoteSummary totals={votes.data} candidates={shortlist.data?.data ?? []} night={night} now={now} />}
      <p className="night-private-note">One vote each. You can change your pick while voting is open. Leaders are provisional, not finalized winners.</p>
      {!writable && <p className="night-notice">{access.data?.account_status === 'restricted' ? 'Read-only shortlist and results for restricted accounts.' : 'Nominations and voting are read-only right now. The server checks every action.'}</p>}
    </section>
    {command.error && dialog === null && <p className="form-error" role="alert">{command.error}</p>}
    {shortlist.isPending ? <MovieGridSkeleton count={4} label="Loading shortlist" /> : shortlist.isError ? <MovieState title="Shortlist unavailable." retry={() => void shortlist.refetch()}>{movieNightError(shortlist.error).message}</MovieState> : <>
      {shortlist.data.meta.metadata_unavailable && <p className="night-notice" role="status">Movie metadata is unavailable. Your nominations and votes are still here.</p>}
      {shortlist.data.data.length ? <ul className="movie-grid night-candidate-grid" aria-label="Shared movie shortlist">{shortlist.data.data.map(entry => {
        const total = totals?.totals.find(row => row.movie_night_movie_id === entry.id)
        const selected = totals?.my_vote === entry.id
        return <MovieCard key={entry.id} movie={entry.movie ?? unavailableMovie(entry)}><div className="night-candidate" data-candidate-id={entry.id}>
          <div className="night-organizer"><Avatar username={entry.nominated_by.username} url={entry.nominated_by.avatar_url} /><span>Nominated by <strong>@{entry.nominated_by.username}</strong></span></div>
          {!entry.movie && <p className="night-private-note">Metadata unavailable · TMDB #{entry.tmdb_id}</p>}
          <p className="night-candidate-votes">{total ? `${total.votes} ${total.votes === 1 ? 'vote' : 'votes'}` : 'Vote count unavailable'}{selected && <strong>✓ Your vote</strong>}</p>
          <div className="night-candidate-actions">{writable && <Button aria-pressed={selected} disabled={busy || !total || selected} onClick={() => void command.run({ kind: 'vote', id: night.id, candidateId: entry.id })}>{selected ? '✓ Your vote' : totals?.my_vote ? 'Change vote' : 'Vote for movie'}<span className="sr-only">: {entry.movie?.title ?? `TMDB ${entry.tmdb_id}`}</span></Button>}
          {writable && !votes.isFetching && canRemoveCandidate(user, access.data, night, entry, totals, now) && <Button disabled={busy} onClick={() => { command.clearError(); setDialog(entry.id) }}>Remove<span className="sr-only"> {entry.movie?.title ?? `TMDB ${entry.tmdb_id}`}</span></Button>}</div>
        </div></MovieCard>
      })}</ul> : <MovieState title={page > 1 ? 'No movies on this page.' : 'Every great night starts with a suggestion.'}>Nominate a movie to start the shared shortlist.</MovieState>}
      <NightPanelPagination page={page} total={shortlist.data.meta.total_pages} onChange={setPage} busy={command.pending} label="Shortlist pages" />
    </>}
    {dialog === 'nominate' && writable && <NominationDialog onClose={() => { command.clearError(); setDialog(null) }} busy={busy} full={full} error={command.error} candidates={totals?.totals.map(row => row.tmdb_id) ?? []} nominate={async tmdbId => { if (await command.run({ kind: 'nominate', id: night.id, tmdbId: asTmdbId(tmdbId) })) setDialog(null) }} />}
    {candidate && dialog !== 'nominate' && removable && <RemovalDialog title={candidate.movie?.title ?? `Movie TMDB #${candidate.tmdb_id}`} busy={busy} error={command.error} onClose={() => { command.clearError(); setDialog(null) }} remove={async () => { if (await command.run({ kind: 'remove', id: night.id, candidateId: candidate.id })) setDialog(null) }} />}
  </section>
}
function VoteSummary({ totals, candidates, night, now }: { totals: VoteTotals; candidates: Candidate[]; night: MovieNight; now: number }) {
  // The local boundary may close presentation, never reopen a server-closed snapshot.
  // Account restrictions affect the caller's actions, not the event's voting state.
  const votingOpen = totals.voting_open && night.voting_open && night.status === 'scheduled' && now < Date.parse(night.starts_at)
  const title = (tmdb: number) => candidates.find(item => item.tmdb_id === tmdb)?.movie?.title ?? `TMDB #${tmdb}`
  const selected = totals.my_vote === null ? undefined : totals.totals.find(row => row.movie_night_movie_id === totals.my_vote)
  return <div className="night-tally" aria-live="polite"><p><strong>{totals.total_votes}</strong> total valid {totals.total_votes === 1 ? 'vote' : 'votes'} · {votingOpen ? 'Voting open' : 'Voting closed'}</p>
    <p>{selected ? `Your vote: ${title(selected.tmdb_id)}` : 'You haven’t voted yet.'}</p>
    <p>{totals.total_votes === 0 ? 'No votes yet. There’s still a story to choose.' : `${totals.leaders.length > 1 ? 'Tied leaders' : 'Current leader'}: ${totals.leaders.map(title).join(' · ')}`}</p></div>
}
export function NightPanelPagination({ page, total, onChange, busy = false, label }: { page: number; total: number; onChange: (page: number) => void; busy?: boolean; label: string }) {
  return (total > 1 || page > 1) && <nav className="night-people-pagination" aria-label={label}><Button disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>Previous</Button><span>Page {page}</span><Button disabled={page >= total || busy} onClick={() => onChange(page + 1)}>Next</Button></nav>
}
function NominationDialog({ onClose, busy, full, error, candidates, nominate }: { onClose: () => void; busy: boolean; full: boolean; error: string; candidates: number[]; nominate: (id: number) => Promise<void> }) {
  const [input, setInput] = useState(''), [settled, setSettled] = useState(''), [page, setPage] = useState(1)
  const query = normalizeQuery(input), valid = query.length > 0 && query.length <= 200, ready = valid && settled === query
  const search = useQuery({ ...searchOptions(settled, page), enabled: ready })
  useEffect(() => { document.querySelector<HTMLInputElement>('#night-movie-search')?.focus() }, [])
  useEffect(() => { const timer = window.setTimeout(() => setSettled(query), 350); return () => window.clearTimeout(timer) }, [query])
  return <Dialog title="Nominate a movie" onClose={onClose} busy={busy} className="night-nominate-dialog">
    <p className="night-dialog-copy">Search by title. Up to 50 shared candidates; the server checks every nomination.</p>
    <Input id="night-movie-search" label="Search movie title" value={input} disabled={busy} maxLength={200} autoComplete="off" onChange={event => { setInput(event.target.value); setPage(1) }} />
    {error && <p className="form-error" role="alert">{error}</p>}{full && <p role="status">The shortlist has reached its 50-movie limit.</p>}
    {!valid ? <p className="night-private-note">Enter a movie title to find a nomination.</p> : !ready || search.isPending ? <p role="status">Searching movies…</p> : search.isError ? <MovieState title="Movie search unavailable." retry={() => void search.refetch()}>{movieError(search.error)}</MovieState> : <>
      {search.data.data.length ? <ul className="movie-grid night-search-grid" aria-label="Movie search results">{search.data.data.map(movie => <MovieCard key={movie.tmdb_id} movie={movie}><Button disabled={busy || full || candidates.includes(movie.tmdb_id)} onClick={() => void nominate(movie.tmdb_id)}>{candidates.includes(movie.tmdb_id) ? 'Already nominated' : 'Nominate'}<span className="sr-only"> {movie.title}</span></Button></MovieCard>)}</ul> : <p className="night-private-note">No movies match this title.</p>}
      <NightPanelPagination page={page} total={Math.min(500, search.data.meta.total_pages)} onChange={setPage} busy={busy} label="Movie search pages" />
    </>}
  </Dialog>
}
function RemovalDialog({ title, busy, error, onClose, remove }: { title: string; busy: boolean; error: string; onClose: () => void; remove: () => Promise<void> }) {
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => { keep.current?.focus() }, [])
  return <Dialog title="Remove this nomination?" busy={busy} onClose={onClose}><p className="night-dialog-copy">Remove “{title}” from the shared shortlist? The server will check that it still has zero votes.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="night-form-actions"><Button ref={keep} disabled={busy} onClick={onClose}>Keep movie</Button><Button className="destructive" disabled={busy} onClick={() => void remove()}>Confirm removal</Button></div></Dialog>
}
