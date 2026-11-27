import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { MovieState } from '../../movies/components/MovieState'
import { MovieNightForm } from '../components/MovieNightForm'
import { useMovieNightMutation } from '../hooks/useMovieNights'
import { useNightBoundary } from '../hooks/useNightBoundary'
import { nightPermissions } from '../lib/permissions'
import type { EventFields } from '../types/movieNight.types'
import '../movie-nights.css'

export default function CreateMovieNightPage() {
  const auth = useAuth()
  return <CreateContent key={`${auth.data?.id}:${auth.data?.email_verified_at}`} owner={auth.data?.id ?? 0} />
}
function CreateContent({ owner }: { owner: number }) {
  const auth = useAuth()
  const access = useAccess(owner, !!auth.data?.email_verified_at)
  const boundary = useNightBoundary(owner)
  const allowed = boundary.isCurrent()
  const mutation = useMovieNightMutation(), navigate = useNavigate()
  const permission = nightPermissions(auth.data, access.data)
  return <section className="movie-nights-page">
    <Link className="text-link night-back" to="/movie-nights">← Movie Nights</Link>
    <div className="night-heading"><div><p className="eyebrow">Set the scene</p><h1>Create a movie night<span className="accent-period">.</span></h1><p>A time, a place, and a little anticipation.</p></div></div>
    {!allowed ? <MovieState title="Creation is unavailable.">Your account access changed. <Link to="/movie-nights">Return to Movie Nights</Link></MovieState>
      : access.isPending ? <MovieState title="Checking your access…">One moment while we check your account.</MovieState>
        : access.isError ? <MovieState title="Creation is unavailable." retry={() => void access.refetch()}>We couldn’t check your account access.</MovieState>
          : !permission.create ? <MovieState title="Creation is unavailable.">Your account can’t create movie nights right now. <Link to="/movie-nights">Return to Movie Nights</Link></MovieState>
            : <div className="night-create-layout"><div className="night-form-panel"><MovieNightForm busy={mutation.isPending} onCancel={() => navigate('/movie-nights')} onSave={async fields => {
              const result = await mutation.mutateAsync({ kind: 'create', fields: fields as EventFields })
              if (result && 'id' in result && boundary.isCurrent()) navigate(`/movie-nights/${result.id}`, { replace: true })
            }} /></div><aside className="night-form-aside"><h2>Something to look forward to.</h2><p>Your location and meeting link stay private to you and accepted guests.</p><p>Set a time in the event’s timezone. Everyone sees the same scheduled moment.</p></aside></div>}
  </section>
}
