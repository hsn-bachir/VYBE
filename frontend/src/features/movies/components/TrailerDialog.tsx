import { useEffect, useRef } from 'react'
import { Button } from '../../../components/ui/Button'
import { trailerEmbed } from '../lib/trailer'
import type { MovieTrailer } from '../types/movie.types'

export default function TrailerDialog({ trailer, title, onClose }: { trailer: MovieTrailer; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const src = trailerEmbed(trailer)
  useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element?.close(); document.body.style.overflow = overflow; trigger?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="trailer-dialog" aria-labelledby="trailer-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="trailer-dialog-content"><div className="trailer-dialog-header"><h2 id="trailer-title">{title} · {trailer.type}</h2><Button autoFocus onClick={onClose} aria-label="Close trailer">Close <span aria-hidden="true">×</span></Button></div>
      {src && <iframe src={src} title={`${title} — ${trailer.name}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
      <p>Playback is provided by YouTube. If this video cannot play here, <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`} target="_blank" rel="noopener noreferrer">watch on YouTube ↗</a>.</p>
    </div>
  </dialog>
}
