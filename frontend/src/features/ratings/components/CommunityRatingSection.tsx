import { useIsMutating, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Alert } from '../../../components/ui/Alert'
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
  if (own.isPending) return <div className="rating-stars-skeleton skeleton" role="status" aria-label="Loading your rating" />
  if (own.isError && own.data === undefined) return <Alert variant="error">{ratingError(own.error)} <Button className="compact" onClick={() => void own.refetch()} disabled={own.isFetching}>Retry your rating</Button></Alert>
  const value = own.data?.rating ?? null
  return <div className="your-rating" aria-busy={busy}>
    <PeekRating value={value} disabled={busy} confirmation={confirmation} resetKey={mutation.submittedAt} onChange={rating => { if (!busy) { setFeedback(''); mutation.mutate({ action: 'put', rating: rating as StarRating }) } }} />
    <div className="personal-rating-actions">{value !== null && <Button className="compact destructive" disabled={busy} onClick={() => { setFeedback(''); mutation.mutate({ action: 'delete' }) }}>Remove rating</Button>}</div>
    {busy && <p className="rating-feedback" role="status">Saving your rating…</p>}
    {!busy && !mutation.isError && feedback && <Alert variant="success">{feedback}</Alert>}
    {mutation.isError && <Alert variant="error">{ratingError(mutation.error, true)} Your last confirmed rating is shown. Choose a star or remove again to retry.</Alert>}
    {own.isError && own.data !== undefined && <Alert variant="warning">Your saved rating could not be refreshed. <Button className="compact" onClick={() => void own.refetch()}>Retry your rating</Button></Alert>}
  </div>
}

export default function CommunityRatingSection({ movie, reviewAction, embedded = false }: { movie: number; reviewAction?: ReactNode; embedded?: boolean }) {
  const statistics = useQuery(statisticsOptions(movie))
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  return <section className="community-ratings" aria-label={embedded ? 'Community ratings' : undefined} aria-labelledby={embedded ? undefined : 'community-ratings-heading'}>
    {!embedded && <div className="section-heading"><div><p className="eyebrow">A shared perspective</p><h2 id="community-ratings-heading">VYBE Community Ratings<span className="accent-period">.</span></h2></div></div>}
    <div className="community-rating-panel">
      <div className="community-rating-summary">
        <div className="community-score"><h3>Community score</h3>
          {statistics.isPending ? <div className="rating-summary-skeleton skeleton" role="status" aria-label="Loading community ratings" /> : statistics.data ? <>
            {statistics.data.average_rating === null ? <p className="rating-empty">No community ratings yet.</p> : <p className="community-score-number"><span aria-hidden="true">★</span> {statistics.data.average_rating.toFixed(2)} <small>/ 5</small></p>}
            <p>{statistics.data.total_ratings.toLocaleString()} {statistics.data.total_ratings === 1 ? 'rating' : 'ratings'} from VYBE members</p>
            <p className="rating-scale-note">VYBE members rate from 1–5 stars. The TMDB score above uses a separate 0–10 scale.</p>
          </> : null}
        </div>
        {statistics.data && <RatingHistogram statistics={statistics.data} />}
        {statistics.isError && <Alert className="rating-statistics-error" variant="error">{statistics.data ? 'Community statistics could not be refreshed. The last loaded values are shown.' : 'Community statistics are temporarily unavailable.'} <Button className="compact" disabled={statistics.isFetching} onClick={() => void statistics.refetch()}>Retry community ratings</Button></Alert>}
      </div>
      <div className="personal-rating-panel"><div className="personal-rating-content"><h3>Your rating</h3><p>Your take, in five stars.</p>
        {auth.isPending ? <p role="status">Checking your account…</p> : auth.isError ? <Alert variant="error">We couldn’t check your account. <Button className="compact" onClick={() => void auth.refetch()}>Retry account</Button></Alert>
          : !auth.data ? <><PeekRating value={null} onChange={() => navigate('/login', { state: { from: location.pathname } })} /><Link className="text-link" to="/login" state={{ from: location.pathname }}>Sign in to rate this movie</Link></>
            : !auth.data.email_verified_at ? <Link className="button" to="/verify-email">Verify email to rate movies</Link>
              : <YourRating key={`${auth.data.id}:${movie}`} owner={auth.data.id} movie={movie} />}</div>
        {reviewAction && <div className="rating-review-action">{reviewAction}</div>}
      </div>
    </div>
  </section>
}
