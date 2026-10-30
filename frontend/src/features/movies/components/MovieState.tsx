import type { ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'

export function MovieState({ title, children, retry }: { title: string; children: ReactNode; retry?: () => void }) {
  return <div className="movie-state" role={retry ? 'alert' : 'status'}><span className="state-orbit" aria-hidden="true">✦</span><h2>{title}</h2><p>{children}</p>{retry && <Button onClick={retry}>Try again <span aria-hidden="true">↗</span></Button>}</div>
}
