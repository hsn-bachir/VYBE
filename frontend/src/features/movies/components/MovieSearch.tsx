import { useEffect, useState } from 'react'
import { normalizeQuery } from '../hooks/useMovies'

export const SEARCH_DEBOUNCE_MS = 350
export function MovieSearch({ query, onSearch, busy }: { query: string; onSearch: (query: string) => void; busy: boolean }) {
  const [state, setState] = useState({ source: query, draft: query })
  // URL navigation is authoritative, including browser back/forward.
  if (state.source !== query) setState({ source: query, draft: query })
  const draft = state.source === query ? state.draft : query
  const setDraft = (value: string) => setState({ source: query, draft: value })
  useEffect(() => {
    const normalized = normalizeQuery(draft)
    if (normalized === query || normalized.length > 200) return
    const timer = setTimeout(() => onSearch(normalized), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, query, onSearch])
  return <form className="movie-search" role="search" onSubmit={event => { event.preventDefault(); onSearch(normalizeQuery(draft)) }}>
    <label className="sr-only" htmlFor="movie-query">Search movies</label><span className="search-glyph" aria-hidden="true">⌕</span>
    <input id="movie-query" name="query" type="search" placeholder="Search for a movie title…" autoComplete="off" maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} aria-describedby="search-hint" />
    {draft && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setDraft(''); onSearch(''); document.getElementById('movie-query')?.focus() }}>×</button>}
    <span className="search-feedback" role="status">{busy ? 'Searching…' : 'Enter ↵'}</span>
  </form>
}
