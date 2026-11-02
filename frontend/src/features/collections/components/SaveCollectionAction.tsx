import { lazy, Suspense, useState } from 'react'
import { Button } from '../../../components/ui/Button'

const SaveCollectionDialog = lazy(() => import('./SaveCollectionDialog'))
export function SaveCollectionAction({ owner, movie, title }: { owner: number; movie: number; title: string }) {
  const [open, setOpen] = useState(false)
  return <div className="membership-control"><Button className="membership-button" onClick={() => setOpen(true)}>＋ Save to collection</Button>
    {open && <Suspense fallback={<p role="status">Opening collections…</p>}><SaveCollectionDialog owner={owner} movie={movie} title={title} onClose={() => setOpen(false)} /></Suspense>}
  </div>
}
