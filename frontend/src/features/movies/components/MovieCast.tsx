import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { movieImageUrl } from '../api/images'
import type { MovieExperienceResponse } from '../types/movie.types'

export function MovieCast({ cast }: { cast: MovieExperienceResponse['data']['cast'] }) {
  const strip = useRef<HTMLUListElement>(null)
  const id = useId()
  const [edges, setEdges] = useState({ start: true, end: true })

  useEffect(() => {
    const element = strip.current
    if (!element) return
    const update = () => setEdges({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    update()
    return () => { observer.disconnect(); element.removeEventListener('scroll', update) }
  }, [cast])

  function scroll(direction: number) {
    const element = strip.current
    if (!element) return
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  if (!cast.length) return null
  return <section className="film-cast" aria-labelledby={`${id}-heading`}>
    <div className="section-heading">
      <div><p className="eyebrow">The faces of the story</p><h2 id={`${id}-heading`}>Cast<span className="accent-period">.</span></h2></div>
      <div className="cast-navigation" aria-label="Cast navigation">
        <Button aria-label="Previous cast members" aria-controls={id} disabled={edges.start} onClick={() => scroll(-1)}><span aria-hidden="true">←</span></Button>
        <Button aria-label="Next cast members" aria-controls={id} disabled={edges.end} onClick={() => scroll(1)}><span aria-hidden="true">→</span></Button>
      </div>
    </div>
    <ul ref={strip} id={id} className="cast-strip" tabIndex={0} aria-label="Cast, scroll for more">
      {cast.map(person => <li key={person.tmdb_id}>
        <div className="cast-portrait">
          {movieImageUrl(person.profile_path) && <img src={movieImageUrl(person.profile_path)} alt="" loading="lazy" width="160" height="200" onError={event => { event.currentTarget.style.display = 'none' }} />}
          <span aria-hidden="true">{person.name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span>
        </div>
        <div className="cast-caption"><h3>{person.name}</h3><p>{person.character || 'Cast member'}</p></div>
      </li>)}
    </ul>
  </section>
}
