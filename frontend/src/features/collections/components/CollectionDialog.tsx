import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'

export function CollectionDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = ref.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element?.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="collection-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="collection-dialog-heading"><h2 id={titleId}>{title}</h2><Button aria-label="Close dialog" disabled={busy} onClick={onClose}>×</Button></div>
    {children}
  </dialog>
}
