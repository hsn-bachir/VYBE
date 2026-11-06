import { useState } from 'react'
import { Dialog } from '../../../components/ui/Dialog'
import { Button } from '../../../components/ui/Button'
import { moderationError } from '../api/moderationApi'

export function ModerationActionDialog({ title, description, confirmLabel, reasonRequired = false, onClose, onConfirm, pending, error }: {
  title: string; description: string; confirmLabel: string; onClose: () => void
  reasonRequired?: boolean; onConfirm: (reason?: string) => void; pending: boolean; error: unknown
}) {
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const count = [...reason.trim()].length
  return <Dialog title={title} onClose={onClose} busy={pending}>
    <form onSubmit={event => { event.preventDefault(); setTried(true); if ((!reasonRequired || count > 0) && count <= 1000 && !pending) onConfirm(reason.trim() || undefined) }}>
      <p className="admin-hint">{description}</p>
      {reasonRequired && <div className="field"><label htmlFor="moderation-reason">Reason for this decision</label>
        <textarea id="moderation-reason" value={reason} onChange={event => setReason(event.target.value)} disabled={pending} rows={4} required aria-invalid={tried && (count === 0 || count > 1000)} />
        <p className={count > 1000 ? 'field-error' : 'hint'}>{count} / 1,000 characters</p>
        {tried && count === 0 && <p className="field-error" role="alert">Enter a reason.</p>}</div>}
      {Boolean(error) && <p role="alert" className="field-error">{moderationError(error)}</p>}
      <div className="admin-dialog-actions"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button className="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : confirmLabel}</Button></div>
    </form>
  </Dialog>
}
