import { Link, useLocation } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { libraryError } from '../api/libraryApi'
import { useLibraryState, useMembership } from '../hooks/useLibrary'
import type { LibraryKind } from '../types/library.types'
import { SaveCollectionAction } from '../../collections/components/SaveCollectionAction'

function MembershipAction({ userId, id, kind, active }: { userId: number; id: number; kind: LibraryKind; active: boolean }) {
  const mutation = useMembership(userId, kind, id)
  const watchlist = kind === 'watchlist'
  const label = watchlist ? (active ? 'In Watchlist' : 'Add to Watchlist') : (active ? 'Watched' : 'Mark as Watched')
  return <div className="membership-control">
    <Button className={`membership-button ${active ? 'is-saved' : ''}`} aria-pressed={active} disabled={mutation.isPending}
      aria-label={active ? `Remove from ${watchlist ? 'Watchlist' : 'Watched'}` : label} onClick={() => mutation.mutate(!active)}>
      <span className={mutation.isSuccess ? 'membership-pulse' : ''} key={mutation.submittedAt} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill={watchlist && active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">{watchlist ? <path d="M6 3h12v18l-6-4-6 4z" /> : <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>}</svg>
      </span>{mutation.isPending ? (active ? 'Removing…' : 'Saving…') : label}
    </Button>
    <div className="action-feedback" role={mutation.isError ? 'alert' : 'status'} aria-live="polite">
      {mutation.isError ? libraryError(mutation.error) : mutation.isSuccess ? `${mutation.variables ? 'Saved to' : 'Removed from'} ${watchlist ? 'Watchlist' : 'Watched'}.` : ''}
    </div>
  </div>
}

export function LibraryActions({ id, title = `TMDB ${id}` }: { id: number; title?: string }) {
  const auth = useAuth()
  const location = useLocation()
  const userId = auth.data?.email_verified_at ? auth.data.id : 0
  const state = useLibraryState(userId, id)
  if (!auth.data) return <p className="library-signin"><Link className="button" to="/login" state={{ from: location.pathname }}>Sign in to save this movie</Link></p>
  if (!userId) return <Link className="button" to="/verify-email">Verify email to save movies</Link>
  if (state.isPending || state.isError) return <div className="library-actions">
    {state.isPending ? <p className="library-state-loading" role="status">Checking your library…</p> : <div className="library-state-error" role="alert"><p>{libraryError(state.error)}</p><Button onClick={() => void state.refetch()} disabled={state.isFetching}>Retry library state</Button></div>}
    <SaveCollectionAction key={`${userId}:${id}:collections`} owner={userId} movie={id} title={title} />
  </div>
  return <div className="library-actions" aria-label="Your movie library">
    <MembershipAction key={`${userId}:${id}:watchlist`} userId={userId} id={id} kind="watchlist" active={state.data.in_watchlist} />
    <MembershipAction key={`${userId}:${id}:watched`} userId={userId} id={id} kind="watched" active={state.data.watched_at !== null} />
    <SaveCollectionAction key={`${userId}:${id}:collections`} owner={userId} movie={id} title={title} />
  </div>
}
