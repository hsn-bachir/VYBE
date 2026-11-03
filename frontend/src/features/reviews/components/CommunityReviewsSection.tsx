import { useIsMutating, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { reviewError } from '../api/reviewsApi'
import { personalReviewOptions, reviewKeys, reviewsOptions, useReviewAccessError, useReviewMutation } from '../hooks/useReviews'
import type { Review, ReviewValues } from '../types/review.types'
import { ReviewCard } from './ReviewCard'
import { ReviewEditor } from './ReviewEditor'
import { DeleteReviewDialog } from './DeleteReviewDialog'
import '../reviews.css'

const emptyDraft: ReviewValues = { body: '', contains_spoilers: false }
function ReviewsExperience({ movie, title, auth }: { movie: number; title: string; auth: ReturnType<typeof useAuth> }) {
  const location = useLocation()
  const owner = auth.data?.email_verified_at ? auth.data.id : 0
  const ready = owner > 0 && !auth.isPending && !auth.isError
  const [page, setPage] = useState(1)
  const result = useQuery(reviewsOptions(movie, page))
  const own = useQuery({ ...personalReviewOptions(owner, movie), enabled: ready && movie > 0 })
  useReviewAccessError(own.error, owner)
  const [editor, setEditor] = useState<{ review: Review | null; values: ReviewValues } | null>(null)
  const [draft, setDraft] = useState<ReviewValues>(emptyDraft)
  const [deleting, setDeleting] = useState<Review | null>(null)
  const [feedback, setFeedback] = useState('')
  const manageButton = useRef<HTMLButtonElement>(null)
  const deleteTrigger = useRef<HTMLElement | null>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const focusManage = () => requestAnimationFrame(() => manageButton.current?.focus({ preventScroll: true }))
  const mutation = useReviewMutation(owner, movie, operation => {
    setEditor(null); setDeleting(null)
    setFeedback(operation.action === 'delete' ? 'Your review was deleted.' : operation.action === 'edit' ? 'Your review was updated.' : 'Your review is published.')
    if (operation.action !== 'edit') setPage(1)
    if (operation.action === 'create') setDraft(emptyDraft)
    focusManage()
  })
  const pending = useIsMutating({ mutationKey: reviewKeys.write(owner, movie) }) > 0
  function startEdit(review: Review | null) {
    if (!ready || pending) return
    mutation.reset(); setFeedback(''); setDeleting(null)
    setEditor({ review, values: review ? { body: review.body, contains_spoilers: review.contains_spoilers } : draft })
  }
  function askDelete(review: Review) { if (ready && !pending) { deleteTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; mutation.reset(); setFeedback(''); setDeleting(review) } }
  const changePage = (next: number) => { setPage(next); listHeading.current?.focus({ preventScroll: true }) }
  return <section className="community-reviews" aria-labelledby="community-reviews-heading">
    <div className="section-heading"><div><p className="eyebrow">Beyond the final frame</p><h2 id="community-reviews-heading">Community Reviews<span className="accent-period">.</span></h2></div></div>
    <p className="reviews-intro">What stayed with you? Share your perspective with the community.</p>
    <div className="review-personal-panel">
      {auth.isPending ? <p role="status">Checking your account…</p> : auth.isError ? <div role="alert"><p>We couldn’t check your account. Your draft stays here.</p><Button onClick={() => void auth.refetch()}>Retry account for reviews</Button></div>
        : !auth.data ? <Link className="button" to="/login" state={{ from: location.pathname }}>Sign in to write a review</Link>
          : !owner ? <Link className="button" to="/verify-email">Verify email to write reviews</Link>
            : own.isPending ? <p role="status">Loading your review…</p>
              : own.isError && own.data === undefined ? <div role="alert"><p>{reviewError(own.error)}</p><Button onClick={() => void own.refetch()}>Retry your review</Button></div>
                : <div className="review-personal-actions"><div><h3>Your perspective</h3><p>{own.data ? 'Your review is published. You can update it anytime.' : 'One review, all your thoughts. A rating is optional.'}</p></div><div className="review-manage-actions"><Button ref={manageButton} disabled={pending} onClick={() => startEdit(own.data ?? null)}>{own.data ? 'Edit your review' : 'Write a review'}</Button>{own.data && <Button disabled={pending} onClick={() => askDelete(own.data!)}>Delete your review</Button>}</div></div>}
      {editor && owner > 0 && <ReviewEditor key={editor.review ? `edit:${editor.review.id}` : 'create'} title={title} initialValues={editor.values} review={editor.review} existingReview={own.data} pending={pending} disabled={!ready} error={mutation.isError ? mutation.error : null}
        onSubmit={values => mutation.mutate(editor.review ? { action: 'edit', id: editor.review.id, values } : { action: 'create', values })}
        onCancel={values => { if (!editor.review) setDraft(values); setEditor(null); mutation.reset(); focusManage() }}
        onEditExisting={values => { setDraft(values); if (own.data) startEdit(own.data) }} onCheckExisting={() => void own.refetch()} />}
      <p className="review-feedback" role="status">{feedback}</p>
    </div>
    <div className="reviews-list-heading"><h3 ref={listHeading} tabIndex={-1}>The conversation{result.data ? <span> · {result.data.meta.total_results.toLocaleString()} {result.data.meta.total_results === 1 ? 'review' : 'reviews'}</span> : ''}</h3>{result.isFetching && !result.isPending && <span role="status">Refreshing reviews…</span>}</div>
    {result.isPending ? <div className="review-loading" role="status">Loading community reviews…<div className="review-skeleton skeleton" aria-hidden="true" /></div>
      : result.isError && !result.data ? <div className="review-empty" role="alert"><p>Community reviews are temporarily unavailable.</p><Button disabled={result.isFetching} onClick={() => void result.refetch()}>Retry community reviews</Button></div>
        : result.data && <>
          {result.isError && <div className="review-refresh-error" role="alert"><p>Reviews could not be refreshed. The last loaded reviews are shown.</p><Button onClick={() => void result.refetch()}>Retry community reviews</Button></div>}
          {result.data.data.length ? <div className="review-list">{result.data.data.map(review => <ReviewCard key={review.id} review={review} busy={pending} onEdit={ready && review.author.id === owner ? () => startEdit(review) : undefined} onDelete={ready && review.author.id === owner ? () => askDelete(review) : undefined} />)}</div>
            : <div className="review-empty"><p>{result.data.meta.total_results === 0 ? 'No reviews yet. Be the first to share your thoughts.' : 'There are no reviews on this page.'}</p>{page > 1 && <Button onClick={() => changePage(1)}>Back to first reviews</Button>}</div>}
          {(result.data.meta.total_pages > 1 || page > 1) && <nav className="review-pagination" aria-label="Review pages"><Button disabled={page <= 1 || result.isFetching} onClick={() => changePage(page - 1)}>Previous reviews</Button><span aria-live="polite">Page {page} of {Math.max(1, result.data.meta.total_pages)}</span><Button disabled={page >= result.data.meta.total_pages || result.isFetching} onClick={() => changePage(page + 1)}>Next reviews</Button></nav>}
        </>}
    {deleting && <DeleteReviewDialog pending={pending} error={mutation.isError ? mutation.error : null} onClose={() => { const triggerGone = !deleteTrigger.current?.isConnected; setDeleting(null); mutation.reset(); if (triggerGone) focusManage() }} onDelete={() => mutation.mutate({ action: 'delete', id: deleting.id })} />}
  </section>
}

export default function CommunityReviewsSection({ movie, title }: { movie: number; title: string }) {
  const auth = useAuth()
  return <ReviewsExperience key={`${movie}:${auth.data?.id ?? 0}`} movie={movie} title={title} auth={auth} />
}
