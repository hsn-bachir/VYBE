import { Link, useSearchParams } from 'react-router-dom'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { MovieState } from '../../movies/components/MovieState'
import { movieNightError } from '../api/errors'
import { MovieNightCard } from '../components/MovieNightCard'
import { useMovieNightQuery } from '../hooks/useMovieNights'
import { dashboardState, dashboardTarget, nightStatusFilters } from '../lib/dashboardState'
import { nightPermissions } from '../lib/permissions'
import '../movie-nights.css'

export default function MovieNightsPage() {
  const auth = useAuth()
  const access = useAccess(auth.data?.id, !!auth.data?.email_verified_at)
  const [params] = useSearchParams()
  const state = dashboardState(params)
  const permissions = nightPermissions(auth.data, access.data)
  return <section className="movie-nights-page" aria-labelledby="movie-nights-heading">
    <AnimatedContent trigger="mount" distance={18} className="night-heading">
      <div><p className="eyebrow">Good films. Better company.</p><h1 id="movie-nights-heading">Movie nights<span className="accent-period">.</span></h1><p>Make a little room for a great film and your favorite people.</p></div>
      {permissions.create && <Link className="button primary" to="/movie-nights/new"><span aria-hidden="true">＋</span> Create Movie Night</Link>}
    </AnimatedContent>
    <nav className="night-views" aria-label="Movie Night views">
      <Link to={dashboardTarget(params, { view: 'nights' })} aria-current={state.view === 'nights' ? 'page' : undefined}>My Movie Nights</Link>
      <Link to={dashboardTarget(params, { view: 'invitations' })} aria-current={state.view === 'invitations' ? 'page' : undefined}>Invitations</Link>
    </nav>
    {access.data?.account_status === 'restricted' && <p className="night-notice" role="status">You can view your movie nights and invitations. Creating events is unavailable while your account is restricted.</p>}
    {!state.valid ? <MovieState title="That view is out of frame."><Link to="/movie-nights">Return to Movie Nights</Link></MovieState>
      : access.isPending ? <MovieState title="Checking your access…">Your movie nights will be here in a moment.</MovieState>
        : access.isError ? <MovieState title="Movie Nights is unavailable." retry={() => void access.refetch()}>We couldn’t check your account access. Please try again.</MovieState>
          : !permissions.read ? <MovieState title="Movie Nights is unavailable.">Your account cannot access movie nights right now.</MovieState>
            : state.view === 'invitations' ? <InvitationsView page={state.page} owner={auth.data!.id} />
              : <NightsView page={state.page} status={state.status} params={params} owner={auth.data!.id} />}
  </section>
}
function LoadingNights() {
  return <div role="status" aria-label="Loading movie nights"><span className="sr-only">Loading movie nights…</span><div className="night-grid" aria-hidden="true">{[1, 2, 3, 4].map(id => <div className="night-skeleton skeleton" key={id} />)}</div></div>
}
function NightsView({ page, status, params, owner }: { page: number; status: ReturnType<typeof dashboardState>['status']; params: URLSearchParams; owner: number }) {
  const result = useMovieNightQuery({ kind: 'list', filters: { page, per_page: 12, ...(status !== 'all' ? { status } : {}) } })
  return <>
    <div className="night-toolbar"><p>Nights you host and invitations you’ve accepted.</p><nav className="night-filters" aria-label="Event status">{nightStatusFilters.map(filter => <Link key={filter} to={dashboardTarget(params, { status: filter })} aria-current={status === filter ? 'page' : undefined}>{filter[0].toUpperCase() + filter.slice(1)}</Link>)}</nav></div>
    {result.isPending ? <LoadingNights /> : result.isError ? <MovieState title="Your movie nights are taking an intermission." retry={() => void result.refetch()}>{movieNightError(result.error).message}</MovieState>
      : result.data.data.length === 0 ? <MovieState title={page > 1 ? 'No movie nights on this page.' : status !== 'all' ? 'No movie nights with this status.' : 'Your next movie night starts here.'}>{page > 1 ? <Link to={dashboardTarget(params, { page: 1 })}>Go to the first page</Link> : status !== 'all' ? <Link to={dashboardTarget(params, { status: 'all' })}>See all your movie nights</Link> : 'Create a night or visit Invitations to accept an invitation.'}</MovieState>
        : <ul className="night-grid" aria-label="Your movie nights">{result.data.data.map(night => <MovieNightCard key={night.id} night={night} owner={owner} />)}</ul>}
    {result.data && !result.isError && <MoviePagination page={page} totalPages={Math.min(10000, result.data.meta.total_pages)} />}
  </>
}
function InvitationsView({ page, owner }: { page: number; owner: number }) {
  const result = useMovieNightQuery({ kind: 'received', page: { page, per_page: 12 } })
  return <>
    <div className="night-toolbar"><div><h2>There’s a seat for you.</h2><p>Pending and declined invitations, across all event statuses.</p></div></div>
    {result.isPending ? <LoadingNights /> : result.isError ? <MovieState title="Your invitations are taking an intermission." retry={() => void result.refetch()}>{movieNightError(result.error).message}</MovieState>
      : result.data.data.length === 0 ? <MovieState title={page > 1 ? 'No invitations on this page.' : 'No pending or declined invitations.'}>{page > 1 ? <Link to="/movie-nights?view=invitations">Go to the first page</Link> : 'Pending and declined invitations appear here. Accepted events are in My Movie Nights.'}</MovieState>
        : <ul className="night-grid" aria-label="Received invitations">{result.data.data.map(invitation => <MovieNightCard key={invitation.id} night={invitation.movie_night} owner={owner} rsvp={invitation.rsvp_status} />)}</ul>}
    {result.data && !result.isError && <MoviePagination page={page} totalPages={Math.min(10000, result.data.meta.total_pages)} />}
    <p className="night-inbox-note">Accepted invitations move to My Movie Nights. Declined invitations stay here.</p>
  </>
}
