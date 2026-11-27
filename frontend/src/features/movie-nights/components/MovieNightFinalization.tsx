import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { MovieCard } from '../../movies/components/MovieCard'
import { detailOptions } from '../../movies/hooks/useMovies'
import type { MovieSummary } from '../../movies/types/movie.types'
import { finalizationAdmission, type FinalizationAdmission } from '../hooks/finalizationAdmission'
import { useNightBoundary } from '../hooks/useNightBoundary'
import { nightOptions } from '../hooks/useMovieNights'
import { useNightContentCommand } from '../hooks/useNightContentCommand'
import { nightPermissions } from '../lib/permissions'
import { schedulePreview } from '../lib/dateTime'
import type { Candidate, MovieNight, TmdbId, VoteTotals } from '../types/movieNight.types'

const fallback = (id: TmdbId): MovieSummary => ({ tmdb_id: id, title: `Movie TMDB #${id}`, poster_path: null, backdrop_path: null, overview: null, release_date: null, tmdb_rating: null, tmdb_vote_count: null })
export function MovieNightFinalization({ night, candidates, totals, reconciling }: { night: MovieNight; candidates: Candidate[]; totals?: VoteTotals; reconciling: boolean }) {
  const { data: user } = useAuth(), owner = user?.id ?? 0
  const access = useAccess(owner, !!user?.email_verified_at), boundary = useNightBoundary(owner, night.id)
  const permission = nightPermissions(user, access.data, night)
  const read = boundary.isCurrent() && !access.isError && permission.privateRead
  const eligible = read && permission.finalize
  const client = useQueryClient()
  const votingState = client.getQueryState(nightOptions(client, owner, { kind: 'votes', id: night.id }).queryKey)
  const fresh = votingState?.status === 'success' && !votingState.isInvalidated
  const valid = fresh && !!totals && totals.total_votes > 0 && totals.leaders.length > 0
  const allowed = eligible && valid
  // A fresh authoritative read retires confirmation without copying private totals into local state.
  const revision = votingState?.dataUpdateCount ?? 0
  const [dialog, setDialog] = useState<(FinalizationAdmission & { conflict: number }) | null>(null)
  const confirmation = useRef<FinalizationAdmission | null>(null)
  useLayoutEffect(() => () => confirmation.current?.retire(), [])
  const command = useNightContentCommand(owner, night.id, allowed, dialog?.revision ?? null)
  const [seenConflict, setSeenConflict] = useState(command.conflict), [review, setReview] = useState(false)
  if (seenConflict !== command.conflict) { setSeenConflict(command.conflict); setReview(eligible) }
  if (review && !eligible) setReview(false)
  // Changes retire the entire confirmation, including its selected TMDB ID. A new click is required.
  if (dialog && (!allowed || revision !== dialog.revision || command.conflict !== dialog.conflict || !dialog.isCurrent())) {
    dialog.retire(); setDialog(null)
    setReview(eligible)
  }
  if (!read) return null
  if (night.status === 'finalized' && night.finalized_tmdb_id) return <FinalizedWinner key={night.finalized_tmdb_id} night={night} id={night.finalized_tmdb_id} candidates={candidates} />
  if (!eligible) return null
  const busy = command.pending || reconciling
  return <section className="night-finalization" aria-labelledby="night-finalization">
    <div><p className="eyebrow">Make it official</p><h2 id="night-finalization">Choose your night’s film</h2><p>Finalize the server-confirmed result whenever your group is ready, even after the scheduled start.</p></div>
    <Button disabled={!valid || busy} onClick={() => {
      confirmation.current?.retire()
      const admission = finalizationAdmission(client, owner, night.id)
      if (!admission.isCurrent()) return
      confirmation.current = admission
      command.clearError(); setReview(false); setDialog({ ...admission, conflict: command.conflict })
    }}>Finalize Movie Night</Button>
    {!valid && <p className="night-private-note">{fresh && totals ? 'At least one valid vote is required.' : 'Fresh authoritative voting results are required before finalizing.'}</p>}
    {review && !dialog && <p className="night-notice" role="status">The result needs a fresh review. Check the current voting results and confirm again.</p>}
    {command.error && !dialog && <p className="form-error" role="alert">{command.error} Review the current results before confirming again.</p>}
    {dialog && allowed && totals && <FinalizationDialog key={dialog.revision} candidates={candidates} leaders={totals.leaders} busy={busy} error={command.error} onClose={() => { dialog.retire(); command.clearError(); setDialog(null) }} confirm={async id => {
      if (await command.run({ kind: 'finalize', id: night.id, confirmed: true, ...(id === undefined ? {} : { tmdbId: id }) }, dialog.isCurrent)) setDialog(null)
    }} />}
  </section>
}
function FinalizationDialog({ candidates, leaders, busy, error, onClose, confirm }: { candidates: Candidate[]; leaders: TmdbId[]; busy: boolean; error: string; onClose: () => void; confirm: (id?: TmdbId) => Promise<void> }) {
  const [selected, setSelected] = useState<TmdbId | undefined>()
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => { keep.current?.focus() }, [])
  const title = (id: TmdbId) => candidates.find(item => item.tmdb_id === id)?.movie?.title ?? `Movie TMDB #${id}`
  const tied = leaders.length > 1
  return <Dialog title="Finalize this movie night?" busy={busy} onClose={onClose} className="night-finalize-dialog">
    <p className="night-dialog-copy">Finalization is irreversible. It closes voting, nominations, RSVP changes and event management. This night cannot be reopened.</p>
    {tied ? <fieldset disabled={busy}><legend>Choose one of the authoritative tied leaders</legend>{leaders.map(id => <label className="night-winner-choice" key={id}><input type="radio" name="winner" value={id} checked={selected === id} onChange={() => setSelected(id)} /><span>{title(id)}</span></label>)}</fieldset> : <p className="night-dialog-copy">Leading movie: <strong>{title(leaders[0]!)}</strong>. The server will confirm the winner.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="night-form-actions"><Button ref={keep} disabled={busy} onClick={onClose}>Keep voting results</Button><Button className="destructive" disabled={busy || tied && !selected} onClick={() => void confirm(tied ? selected : undefined)}>{busy ? 'Finalizing…' : 'Confirm finalization'}</Button></div>
  </Dialog>
}
function FinalizedWinner({ night, id, candidates }: { night: MovieNight; id: TmdbId; candidates: Candidate[] }) {
  const available = candidates.find(item => item.tmdb_id === id)?.movie
  // Public Core metadata contains no event data; only one winner lookup, never per-candidate calls.
  const metadata = useQuery({ ...detailOptions(String(id)), enabled: !available })
  const movie = available ?? (!metadata.isError ? metadata.data?.data : undefined) ?? fallback(id)
  let finalized = 'Finalization time unavailable'
  try { if (night.finalized_at) finalized = schedulePreview(night.finalized_at, night.timezone) } catch { /* Retain stored winner without requiring metadata/time formatting. */ }
  return <section className="night-finalized" aria-labelledby="night-finalized"><div><p className="eyebrow">The film is chosen</p><h2 id="night-finalized">Your finalized movie</h2><p>Finalized <time dateTime={night.finalized_at ?? undefined}>{finalized}</time></p><p>This is the stored final winner. Voting results below remain a read-only record.</p>{!available && (metadata.isError || !metadata.data) && <p className="night-private-note">{metadata.isFetching ? 'Loading winner metadata…' : `Metadata unavailable · TMDB #${id}`}</p>}</div><ul className="movie-grid night-winner-card" aria-label="Finalized winning movie"><MovieCard movie={movie} /></ul></section>
}
