import { useIsMutating, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { PeekRating } from '../../../components/react-bits/PeekRating'
import { useAuth } from '../../auth/hooks/useAuth'
import { ratingError } from '../api/ratingsApi'
import { personalRatingOptions, ratingKeys, statisticsOptions, useRatingAccessError, useRatingMutation } from '../hooks/useRatings'
import type { StarRating } from '../types/rating.types'
import { RatingHistogram } from './RatingHistogram'
import '../ratings.css'

function YourRating({ owner, movie }: { owner: number; movie: number }) {
  const own = useQuery(personalRatingOptions(owner, movie))
  useRatingAccessError(own.error, owner)
  const [feedback, setFeedback] = useState('')
  const [confirmation, setConfirmation] = useState(0)
  const mutation = useRatingMutation(owner, movie, operation => {
    setFeedback(operation.action === 'delete' ? 'Your rating was removed.' : `Your ${operation.rating}-star rating is saved.`)
    setConfirmation(value => value + 1)
  })
  const busy = useIsMutating({ mutationKey: ratingKeys.write(owner, movie) }) > 0
  if (own.isPending) return <p role="status">Loading your rating…</p>
  if (own.isError && own.data === undefined) return <div role="alert"><p>{ratingError(own.error)}</p><Button onClick={() => void own.refetch()} disabled={own.isFetching}>Retry your rating</Button></div>
  const value = own.data?.rating ?? null
  return <div className="your-rating" aria-busy={busy}>
    <PeekRating value={value} disabled={busy} confirmation={confirmation} resetKey={mutation.submittedAt} onChange={rating => { if (!busy) { setFeedback(''); mutation.mutate({ action: 'put', rating: rating as StarRating }) } }} />
    <div className="personal-rating-actions">{value !== null && <Button disabled={busy} onClick={() => { setFeedback(''); mutation.mutate({ action: 'delete' }) }}>Remove rating</Button>}</div>
    <p className="rating-feedback" role="status">{busy ? 'Saving your rating…' : mutation.isError ? '' : feedback}</p>
    {mutation.isError && <p className="form-error" role="alert">{ratingError(mutation.error, true)} Your last confirmed rating is shown. Choose a star or remove again to retry.</p>}
    {own.isError && own.data !== undefined && <p role="alert">Your saved rating could not be refreshed. <Button onClick={() => void own.refetch()}>Retry your rating</Button></p>}
  </div>
}

export default function CommunityRatingSection({ movie }: { movie: number }) {
  const statistics = useQuery(statisticsOptions(movie))
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  return <section className="community-ratings" aria-labelledby="community-ratings-heading">
    <div className="section-heading"><div><p className="eyebrow">A shared perspective</p><h2 id="community-ratings-heading">VYBE Community Ratings<span className="accent-period">.</span></h2></div></div>
    <div className="community-rating-panel">
      <div className="community-rating-summary">
        <div className="community-score"><h3>Community score</h3>
          {statistics.isPending ? <p role="status">Loading community ratings…</p> : statistics.data ? <>
            {statistics.data.average_rating === null ? <p className="rating-empty">No community ratings yet.</p> : <p className="community-score-number"><span aria-hidden="true">★</span> {statistics.data.average_rating.toFixed(2)} <small>/ 5</small></p>}
            <p>{statistics.data.total_ratings.toLocaleString()} {statistics.data.total_ratings === 1 ? 'rating' : 'ratings'} from VYBE members</p>
            <p className="rating-scale-note">VYBE members rate from 1–5 stars. The TMDB score above uses a separate 0–10 scale.</p>
          </> : null}
        </div>
        {statistics.data && <RatingHistogram statistics={statistics.data} />}
        {statistics.isError && <div className="rating-statistics-error" role="alert"><p>{statistics.data ? 'Community statistics could not be refreshed. The last loaded values are shown.' : 'Community statistics are temporarily unavailable.'}</p><Button disabled={statistics.isFetching} onClick={() => void statistics.refetch()}>Retry community ratings</Button></div>}
      </div>
      <div className="personal-rating-panel"><h3>Your rating</h3><p>Your take, in five stars.</p>
        {auth.isPending ? <p role="status">Checking your account…</p> : auth.isError ? <div role="alert"><p>We couldn’t check your account.</p><Button onClick={() => void auth.refetch()}>Retry account</Button></div>
          : !auth.data ? <><PeekRating value={null} onChange={() => navigate('/login', { state: { from: location.pathname } })} /><Link className="text-link" to="/login" state={{ from: location.pathname }}>Sign in to rate this movie</Link></>
            : !auth.data.email_verified_at ? <Link className="button" to="/verify-email">Verify email to rate movies</Link>
              : <YourRating key={`${auth.data.id}:${movie}`} owner={auth.data.id} movie={movie} />}
      </div>
    </div>
  </section>
}
