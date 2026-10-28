import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import { useAuth, useLogout } from '../features/auth/hooks/useAuth'
import { errorDetails } from '../lib/api/client'
import { Button } from '../components/ui/Button'
import { VybeLogo } from '../components/branding/VybeLogo'
import { MovieNavigation } from '../components/navigation/MovieNavigation'

export function AppLayout() {
  const auth = useAuth()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()
  const navigation = useNavigationType()
  const content = useRef<HTMLElement>(null)
  const positions = useRef(new Map<string, number>())
  const previousPath = useRef<string | null>(null)
  const leaving = useRef(false)
  const [scrolled, setScrolled] = useState(false)
  useLayoutEffect(() => {
    leaving.current = false
    const key = location.pathname + location.search
    const sameDiscover = previousPath.current === '/discover' && location.pathname === '/discover'
    if (!sameDiscover) {
      const restore = navigation === 'POP' || location.state?.restoreHome
      window.scrollTo({ top: restore ? positions.current.get(key) ?? 0 : 0, behavior: 'instant' })
      content.current?.focus({ preventScroll: true })
    }
    previousPath.current = location.pathname
    const track = () => { if (!leaving.current) positions.current.set(key, window.scrollY) }
    window.addEventListener('scroll', track, { passive: true })
    return () => window.removeEventListener('scroll', track)
  }, [location.pathname, location.search, location.state, navigation])
  useEffect(() => {
    document.title = location.pathname === '/' ? 'VYBE — For the love of cinema' : location.pathname === '/discover' ? 'Discover — VYBE' : 'Movie — VYBE'
  }, [location.pathname])
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return <div className="app-layout" onClickCapture={event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (!link) return
    const target = new URL(link.href)
    if (target.origin === window.location.origin && target.pathname + target.search !== location.pathname + location.search) {
      // Capture before a shorter destination can clamp the document's scroll position.
      positions.current.set(location.pathname + location.search, window.scrollY)
      leaving.current = true
    }
  }}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className={`app-header ${scrolled ? 'is-scrolled' : ''}`}><VybeLogo /><MovieNavigation /><Link className="header-search" to="/discover" aria-label="Find a movie"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg></Link><nav className="account-nav" aria-label="Account navigation">
      {auth.isPending ? <span role="status">Checking session…</span> : auth.data ? <><span className="account-name">@{auth.data.username}</span><Button disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })}>{logout.isPending ? 'Signing out…' : 'Sign out'}</Button></> : <><Link to="/login">Sign in</Link><Link className="button" to="/register">Join VYBE</Link></>}
    </nav></header>
    {logout.error && <p role="alert" className="form-error">{errorDetails(logout.error).message}</p>}
    {auth.isError && <p role="alert">Session unavailable. <button onClick={() => void auth.refetch()}>Retry</button></p>}
    <main id="main-content" ref={content} tabIndex={-1} className="public-content"><Outlet /></main>
    <footer className="app-footer"><div className="footer-top"><VybeLogo variant="symbol" /><p>For the love of cinema.</p><Link to="/discover">Find your next story ↗</Link></div><details className="movie-credits"><summary>About &amp; credits</summary><div><p>VYBE is a place to discover the films that stay with you. Movie metadata and imagery are provided by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.</p><img className="tmdb-logo" src="/tmdb-logo.svg" alt="TMDB" width="80" height="58" /><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></div></details></footer>
  </div>
}
