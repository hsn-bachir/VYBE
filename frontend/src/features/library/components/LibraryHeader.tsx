import { NavLink } from 'react-router-dom'
import '../library.css'

export function LibraryHeader() {
  return <>
    <div className="library-heading"><p className="eyebrow">Your own corner of cinema</p><h1>My library<span className="accent-period">.</span></h1><p>The stories ahead. The films that stay with you.</p></div>
    <nav className="library-tabs" aria-label="Personal library"><NavLink to="/library/watchlist">Watchlist</NavLink><NavLink to="/library/watched">Watched</NavLink><NavLink to="/library/collections">Collections</NavLink></nav>
  </>
}
