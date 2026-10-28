import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MovieSummary } from '../types/movie.types'
import { releaseYear } from '../api/images'
import AnimatedContent from '../../../components/react-bits/AnimatedContent'
import { prepareBackdrop } from '../lib/prepareBackdrop'
import { usePageVisible, useReducedMotion } from '../hooks/useMotionPreference'
import { MovieImage } from './MovieImage'
import { MovieRating } from './MovieRating'
import { SPOTLIGHT_INTERVAL } from '../lib/spotlight'

export function Spotlight({ movies }: { movies: MovieSummary[] }) {
  const [slide, setSlide] = useState({ index: 0, previous: -1, turn: 0 })
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [preparing, setPreparing] = useState(false)
  const request = useRef(0)
  const backdrops = useRef(new Map<string, Promise<boolean>>())
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const progress = useRef({ turn: 0, elapsed: 0 })
  const count = movies.length
  const index = count ? slide.index % count : 0
  const playing = count > 1 && !preparing && !paused && !hovered && !focused && visible && !reduced
  const prepare = useCallback((path: string | null) => {
    const key = `${path ?? ''}:${window.innerWidth * window.devicePixelRatio > 780 ? '1280' : '780'}`
    const cached = backdrops.current.get(key)
    if (cached) return cached
    const loading = prepareBackdrop(path).then(ready => { if (!ready) backdrops.current.delete(key); return ready })
    backdrops.current.set(key, loading)
    return loading
  }, [])
  useEffect(() => () => { request.current++ }, [])
  useEffect(() => {
    const resetHidden = () => {
      if (!document.hidden) return
      request.current++
      setPreparing(false)
      // A returning viewer gets a full scene interval, even if the tab hid near its end.
      setSlide(current => ({ ...current, turn: current.turn + 1 }))
    }
    document.addEventListener('visibilitychange', resetHidden)
    return () => document.removeEventListener('visibilitychange', resetHidden)
  }, [])
  const move = useCallback(async (target: number, manual = true) => {
    if (!count) return
    const next = (target + count) % count
    if (next === index) return
    const ticket = ++request.current
    setPreparing(true)
    const ready = await prepare(movies[next].backdrop_path)
    if (ticket !== request.current) return
    setPreparing(false)
    if (!ready) {
      // Retain the usable scene; retry on the next full interval rather than spinning.
      setSlide(current => ({ ...current, turn: current.turn + 1 }))
      if (manual) setAnnouncement('This scene could not load. Please try again.')
      return
    }
    setSlide(current => ({ index: next, previous: index, turn: current.turn + 1 }))
    if (manual) setAnnouncement(`Showing ${movies[next].title}, ${next + 1} of ${count}`)
  }, [count, index, movies, prepare])
  useEffect(() => {
    if (progress.current.turn !== slide.turn) progress.current = { turn: slide.turn, elapsed: 0 }
    if (!playing) return
    const clock = progress.current
    const start = performance.now()
    const timer = window.setTimeout(() => {
      void move(index + 1, false)
    }, Math.max(0, SPOTLIGHT_INTERVAL - clock.elapsed))
    return () => { window.clearTimeout(timer); clock.elapsed += performance.now() - start }
  }, [playing, slide.turn, index, move])
  useEffect(() => {
    if (count < 2) return
    // Warm only the next image; no detail API calls and no eager download of all slides.
    void prepare(movies[(index + 1) % count].backdrop_path)
  }, [movies, index, count, prepare])
  useEffect(() => {
    if (slide.previous < 0) return
    const duration = reduced ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scene')) || 1100
    const timer = window.setTimeout(() => setSlide(current => current.turn === slide.turn ? { ...current, previous: -1 } : current), duration)
    return () => window.clearTimeout(timer)
  }, [slide.turn, slide.previous, reduced])
  if (!count) return null
  return <section className="spotlight-section" aria-labelledby="spotlight-heading">
    <AnimatedContent className="section-heading"><div><p className="eyebrow">Worth a closer look</p><h2 id="spotlight-heading">In the Spotlight<span className="accent-period">.</span></h2></div><span className="spotlight-edition">THE VYBE SELECTION</span></AnimatedContent>
    <div className="spotlight" role="region" aria-roledescription="carousel" aria-label="Featured movies" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <div className="spotlight-stage">
        {movies.map((movie, position) => <div key={movie.tmdb_id} className={`spotlight-slide ${position === index ? 'is-active' : position === slide.previous ? 'is-previous' : ''}`} aria-hidden={position !== index} inert={position !== index} role="group" aria-roledescription="slide" aria-label={`${position + 1} of ${count}`}>
          {(position === index || position === slide.previous) && <div className="spotlight-art"><MovieImage path={movie.backdrop_path} title={movie.title} variant="backdrop" eager /></div>}
          <div className="spotlight-shade" /><div className={`spotlight-copy ${movie.title.length > 55 ? 'has-long-title' : ''}`}><div className="hero-meta"><MovieRating rating={movie.tmdb_rating} votes={movie.tmdb_vote_count} />{releaseYear(movie.release_date) && <span>{releaseYear(movie.release_date)}</span>}</div><h3>{movie.title}</h3>{movie.overview && <p>{movie.overview}</p>}<Link className="button primary" to={`/movies/${movie.tmdb_id}`} state={{ from: '/', restoreHome: true }}>Explore Movie <span aria-hidden="true">↗</span></Link></div>
        </div>)}
        <div className="spotlight-controls" aria-busy={preparing}><span className="spotlight-count"><strong>{String(index + 1).padStart(2, '0')}</strong> / {String(count).padStart(2, '0')}</span>
        {count > 1 && <><div className="spotlight-dots" aria-label="Choose a featured movie">{movies.map((movie, position) => <button key={movie.tmdb_id} onClick={() => move(position)} aria-label={`Show ${movie.title}`} aria-pressed={position === index}><span /></button>)}</div>
          <button className="spotlight-playback" onClick={() => setPaused(value => !value)} disabled={reduced} aria-label={reduced ? 'Automatic rotation disabled for reduced motion' : paused ? 'Resume automatic Spotlight' : 'Pause automatic Spotlight'}>{reduced ? 'Manual playback' : paused ? 'Resume' : 'Pause'}<span aria-hidden="true">{paused || reduced ? '▷' : 'Ⅱ'}</span></button>
          <div className="spotlight-arrows"><button onClick={() => move(index - 1)} aria-label="Previous spotlight movie">←</button><button onClick={() => move(index + 1)} aria-label="Next spotlight movie">→</button></div></>}
        </div>
        {count > 1 && <div className="spotlight-progress" aria-hidden="true"><span key={slide.turn} style={{ animationDuration: `${SPOTLIGHT_INTERVAL}ms`, animationPlayState: playing ? 'running' : 'paused' }} /></div>}
      </div>
    </div><span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
  </section>
}
