import { useId, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { errorDetails } from '../../../lib/api/client'
import { reviewError, reviewStatus } from '../api/reviewsApi'
import type { Review, ReviewValues } from '../types/review.types'

export function ReviewEditor({ title, initialValues, review, existingReview, error, pending, disabled = false, onSubmit, onCancel, onEditExisting, onCheckExisting }: {
  title: string; initialValues: ReviewValues; review: Review | null; existingReview?: Review | null; error: unknown; pending: boolean; disabled?: boolean
  onSubmit: (values: ReviewValues) => void; onCancel: (values: ReviewValues) => void; onEditExisting: (values: ReviewValues) => void; onCheckExisting: () => void
}) {
  const id = useId()
  const [body, setBody] = useState(initialValues.body)
  const [spoilers, setSpoilers] = useState(initialValues.contains_spoilers)
  const [invalid, setInvalid] = useState(false)
  const trimmed = body.trim()
  const count = [...trimmed].length
  const fields = errorDetails(error).fields
  const values = () => ({ body, contains_spoilers: spoilers })
  const bodyError = invalid && count === 0 ? 'Write at least one character.' : count > 5000 ? 'Keep your review within 5,000 characters.' : fields.body?.[0]
  return <form className="review-editor" noValidate aria-label={review ? 'Edit your review' : 'Write your review'} aria-busy={pending} onSubmit={event => {
    event.preventDefault(); if (pending || disabled) return
    setInvalid(true); if (!count || count > 5000) return
    onSubmit({ body: trimmed, contains_spoilers: spoilers })
  }}>
    <h3>{review ? 'Edit your review' : 'Write your review'}</h3><p className="review-editor-intro">Share your thoughts about {title}.</p>
    <div className="field"><label htmlFor={`${id}-body`}>Your review</label><textarea id={`${id}-body`} rows={7} autoFocus value={body} disabled={pending || disabled} onChange={event => setBody(event.target.value)} aria-invalid={Boolean(bodyError)} aria-describedby={`${id}-count ${id}-error`} />
      <div className="review-editor-meta"><p id={`${id}-count`} className={count > 5000 ? 'field-error' : 'hint'}>{count.toLocaleString()} / 5,000 characters after trimming</p><p id={`${id}-error`} className="field-error">{bodyError}</p></div>
    </div>
    <label className="review-spoiler-toggle"><input type="checkbox" checked={spoilers} disabled={pending || disabled} onChange={event => setSpoilers(event.target.checked)} aria-describedby={`${id}-spoiler-help`} />My review contains spoilers</label>
    <p id={`${id}-spoiler-help`} className={fields.contains_spoilers ? 'field-error' : 'hint'}>{fields.contains_spoilers?.[0] ?? 'Reviews marked as spoilers stay concealed until readers choose to reveal them.'}</p>
    {Boolean(error) && <div className="form-error" role="alert"><p>{reviewError(error, true)}</p>{reviewStatus(error) === 409 && !review && (existingReview ? <Button type="button" onClick={() => onEditExisting(values())}>Open existing review to edit</Button> : <Button type="button" onClick={onCheckExisting}>Check existing review</Button>)}</div>}
    <div className="review-editor-actions"><Button type="button" disabled={pending} onClick={() => onCancel(values())}>Cancel</Button><Button className="primary" type="submit" disabled={pending || disabled || count > 5000}>{pending ? 'Saving…' : review ? 'Save changes' : 'Publish review'}</Button></div>
  </form>
}
