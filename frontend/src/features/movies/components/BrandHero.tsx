import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import hero from '../../../assets/hero.webp'
import { normalizeQuery } from '../hooks/useMovies'

export function BrandHero() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  return <section className="brand-hero" aria-labelledby="brand-headline">
    <img className="brand-hero-art" src={hero} width="1774" height="887" alt="" fetchPriority="high" />
    <div className="brand-hero-shade" />
    <div className="brand-hero-copy"><p className="eyebrow">Movies hit different</p><h1 id="brand-headline">More<br />than <span>movies.</span></h1><p className="brand-hero-description">Discover your next obsession.</p>
      <form className="hero-search" role="search" onSubmit={event => { event.preventDefault(); const value = normalizeQuery(query); if (value) navigate(`/discover?${new URLSearchParams({ query: value })}`) }}>
        <label htmlFor="hero-query" className="sr-only">Search movie titles</label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input id="hero-query" name="query" type="search" placeholder="Find your next favorite movie…" maxLength={200} required value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
        <button type="submit" aria-label="Search movies" disabled={!normalizeQuery(query)}><span aria-hidden="true">↗</span></button>
      </form><p className="hero-search-hint">A world of stories. One title away.</p>
    </div>
  </section>
}
