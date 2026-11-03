import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import './Dialog.css'

export function Dialog({ title, children, onClose, busy = false, className = '', headingClassName = '' }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string; headingClassName?: string
}) {
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
  useEffect(() => {
    if (busy && ref.current?.open) ref.current.focus()
  }, [busy])
  return <dialog ref={ref} tabIndex={-1} className={`app-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0)
    if (!controls.length) { event.preventDefault(); event.currentTarget.focus(); return }
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}>
    <div className={`app-dialog-heading ${headingClassName}`}><h2 id={titleId}>{title}</h2><Button aria-label="Close dialog" disabled={busy} onClick={onClose}>×</Button></div>
    {children}
  </dialog>
}
