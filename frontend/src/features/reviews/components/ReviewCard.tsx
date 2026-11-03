import { useId, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import type { Review } from '../types/review.types'

function ReviewBody({ review }: { review: Review }) {
  const [revealed, setRevealed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const letters = [...review.body]
  const long = letters.length > 600
  const visible = !review.contains_spoilers || revealed
  return <div className="review-content">
    {review.contains_spoilers && <p className="review-spoiler-status" role="status">{revealed ? 'Spoiler revealed' : 'This review contains spoilers.'}</p>}
    <div id={contentId} className={visible ? '' : 'review-spoiler-mask'}>
      {visible ? <div className={`review-copy ${review.contains_spoilers ? 'review-reveal' : ''}`}>
        <p>{long && !expanded ? `${letters.slice(0, 600).join('')}…` : review.body}</p>
        {long && <Button className="review-text-action" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Read full review'}</Button>}
      </div> : <p>The story stays under wraps until you choose to read it.</p>}
    </div>
    {review.contains_spoilers && <Button className="review-text-action" aria-expanded={revealed} aria-controls={contentId} onClick={() => { setRevealed(value => !value); setExpanded(false) }}>{revealed ? 'Hide spoiler' : 'Reveal review'}</Button>}
  </div>
}

function avatarUrl(value: string | null): string | undefined {
  if (!value) return undefined
  if (value.startsWith('/storage/')) return value
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? value : undefined } catch { return undefined }
}

export function ReviewCard({ review, onEdit, onDelete, busy = false }: { review: Review; onEdit?: () => void; onDelete?: () => void; busy?: boolean }) {
  const date = review.created_at ? new Date(review.created_at) : null
  const validDate = date && !Number.isNaN(date.getTime())
  const avatar = avatarUrl(review.author.avatar_url)
  return <article className={`review-card ${onEdit ? 'is-own' : ''}`} aria-label={`Review by ${review.author.username}`}>
    <header className="review-card-header"><div className="review-author">
      <span className="review-avatar" aria-hidden="true">{avatar && <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none' }} />}<span>{review.author.username.slice(0, 1).toUpperCase()}</span></span>
      <div><h3>@{review.author.username}</h3><p>{validDate ? <time dateTime={review.created_at!}>{date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time> : 'Date unavailable'}{review.updated_at && review.updated_at !== review.created_at && <span> · Edited</span>}{onEdit && <span className="review-own-label"> · Your review</span>}</p></div>
    </div>{onEdit && onDelete && <div className="review-card-actions"><Button disabled={busy} onClick={onEdit} aria-label={`Edit review by ${review.author.username}`}>Edit</Button><Button disabled={busy} onClick={onDelete} aria-label={`Delete review by ${review.author.username}`}>Delete</Button></div>}</header>
    <ReviewBody key={JSON.stringify([review.tmdb_id, review.id, review.updated_at, review.contains_spoilers, review.body])} review={review} />
  </article>
}
