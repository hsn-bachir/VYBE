import type { ReactNode } from 'react'
import { Dialog } from '../../../components/ui/Dialog'

export function CollectionDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  return <Dialog title={title} onClose={onClose} busy={busy} className="collection-dialog" headingClassName="collection-dialog-heading">{children}</Dialog>
}
