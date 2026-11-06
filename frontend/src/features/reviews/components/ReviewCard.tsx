import { useId, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Avatar } from '../../../components/ui/Avatar'
import type { Review } from '../types/review.types'

function ReviewBody({ review }: { review: Review }) {
  const [revealed, setRevealed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const letters = [...review.body]
  const long = letters.length > 360 || review.body.split(/\r\n|\r|\n/).length > 4
  const visible = !review.contains_spoilers || revealed
  return <div className="review-content">
    {review.contains_spoilers && <div className={`review-spoiler-notice ${revealed ? 'is-revealed' : ''}`}>
      <svg className="review-spoiler-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c5.5 0 9 7 9 7a18 18 0 0 1-3.2 4M6.2 6.2A20 20 0 0 0 3 12s3.5 7 9 7a10 10 0 0 0 4.2-.9" /></svg>
      <span className="review-spoiler-message" role="status"><strong>{revealed ? 'Spoilers revealed' : 'Spoiler hidden'}</strong>{!revealed && <span>Contains plot details.</span>}</span>
      <Button className="review-spoiler-action" aria-expanded={revealed} aria-controls={contentId} onClick={() => { setRevealed(value => !value); setExpanded(false) }}>{revealed ? 'Hide spoiler' : 'Reveal review'}</Button>
    </div>}
    <div id={contentId}>
      {visible && <div className={`review-copy ${review.contains_spoilers ? 'review-reveal' : ''}`}>
        <p className={long && !expanded ? 'review-copy-preview' : ''}>{long && !expanded ? `${letters.slice(0, 360).join('')}…` : review.body}</p>
        {long && <Button className="review-text-action" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Read full review'}</Button>}
      </div>}
    </div>
  </div>
}

export function ReviewCard({ review, onEdit, onDelete, busy = false }: { review: Review; onEdit?: () => void; onDelete?: () => void; busy?: boolean }) {
  const date = review.created_at ? new Date(review.created_at) : null
  const validDate = date && !Number.isNaN(date.getTime())
  return <article className={`review-card ${onEdit ? 'is-own' : ''}`} aria-label={`Review by ${review.author.username}`}>
    <header className="review-card-header"><div className="review-author">
      <Avatar username={review.author.username} url={review.author.avatar_url} className="review-avatar" />
      <div><h3>@{review.author.username}</h3><p>{validDate ? <time dateTime={review.created_at!}>{date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time> : 'Date unavailable'}{review.updated_at && review.updated_at !== review.created_at && <span> · Edited</span>}{onEdit && <span className="review-own-label"> · Your review</span>}</p></div>
    </div>{onEdit && onDelete && <div className="review-card-actions"><Button disabled={busy} onClick={onEdit} aria-label={`Edit review by ${review.author.username}`}>Edit</Button><Button disabled={busy} onClick={onDelete} aria-label={`Delete review by ${review.author.username}`}>Delete</Button></div>}</header>
    <ReviewBody key={JSON.stringify([review.tmdb_id, review.id, review.updated_at, review.contains_spoilers, review.body])} review={review} />
  </article>
}
