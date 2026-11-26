import { useEffect, useRef } from 'react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { movieNightError } from '../api/errors'
import { useMovieNightMutation } from '../hooks/useMovieNights'
import type { MovieNight } from '../types/movieNight.types'
import { MovieNightForm } from './MovieNightForm'

export function EditMovieNightDialog({ night, onClose }: { night: MovieNight; onClose: () => void }) {
  const mutation = useMovieNightMutation()
  useEffect(() => { document.querySelector<HTMLInputElement>('.night-edit-dialog input[name=title]')?.focus() }, [])
  return <Dialog title="Edit movie night" busy={mutation.isPending} onClose={onClose} className="night-edit-dialog">
    <MovieNightForm night={night} busy={mutation.isPending} onCancel={onClose} onSave={async fields => { await mutation.mutateAsync({ kind: 'update', id: night.id, fields }); onClose() }} />
  </Dialog>
}
export function CancelMovieNightDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const mutation = useMovieNightMutation()
  const submitting = useRef(false)
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => { keep.current?.focus() }, [])
  return <Dialog title="Cancel this movie night?" busy={mutation.isPending} onClose={onClose}>
    <p className="night-dialog-copy">Cancellation is irreversible. This night cannot be reopened, and no further edits or guest contributions will be possible. Its history will be kept.</p>
    {mutation.isError && <p className="form-error" role="alert">{movieNightError(mutation.error).message}</p>}
    <div className="night-form-actions"><Button ref={keep} autoFocus disabled={mutation.isPending} onClick={onClose}>Keep movie night</Button><Button className="destructive" disabled={mutation.isPending} onClick={async () => {
      if (submitting.current || mutation.isPending) return
      submitting.current = true
      try { await mutation.mutateAsync({ kind: 'cancel', id }); onClose() } catch { /* Keep the confirmation open with the normalized mutation error. */ }
      finally { submitting.current = false }
    }}>{mutation.isPending ? 'Cancelling…' : 'Cancel movie night'}</Button></div>
  </Dialog>
}
