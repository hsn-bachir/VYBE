import { useCallback, useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function MovieNavigation() {
  const { pathname } = useLocation()
  const nav = useRef<HTMLElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  const section = pathname === '/' ? 'home' : pathname.startsWith('/discover') || pathname.startsWith('/movies/') ? 'discover' : null
  const position = useCallback((snap = false) => {
    const bar = nav.current
    const line = indicator.current
    if (!bar || !line) return
    const active = bar.querySelector<HTMLAnchorElement>('[aria-current="page"]')
    if (!active) { line.style.opacity = '0'; return }
    if (snap || line.style.transform === '') line.dataset.snap = 'true'
    line.style.transform = `translateX(${active.offsetLeft}px) scaleX(${active.offsetWidth})`
    line.style.opacity = '1'
    if (line.dataset.snap) { line.getBoundingClientRect(); delete line.dataset.snap }
  }, [])
  useLayoutEffect(() => position(), [section, position])
  useLayoutEffect(() => {
    if (!nav.current) return
    let initial = true
    const observer = new ResizeObserver(() => { if (initial) { initial = false; return } position(true) })
    observer.observe(nav.current)
    return () => observer.disconnect()
  }, [position])
  return <nav ref={nav} className="discovery-nav" aria-label="Movie navigation">
    <span ref={indicator} className="nav-indicator" aria-hidden="true" />
    <Link to="/" aria-current={section === 'home' ? 'page' : undefined}>Home</Link>
    <Link to="/discover" aria-current={section === 'discover' ? 'page' : undefined}>Discover</Link>
  </nav>
}
