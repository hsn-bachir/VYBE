import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { releaseYear } from '../../movies/api/images'
import { searchOptions } from '../../movies/hooks/useMovies'

export function AdminMovieFilter({ selectedId, selectedTitle, onSelect }: {
  selectedId: string; selectedTitle?: string; onSelect: (id: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setQuery(draft.trim()), 300); return () => window.clearTimeout(timer) }, [draft])
  const search = useQuery({ ...searchOptions(query, 1), enabled: query.length >= 2 && query.length <= 200 })
  return <div className="field admin-movie-filter"><label htmlFor="admin-movie-search">Search movies by title</label>
    <input id="admin-movie-search" type="search" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Search movie titles" autoComplete="off" />
    {selectedId && <div className="admin-selected-movie"><span>Filtering: {selectedTitle || `Movie #${selectedId}`}</span><Button type="button" onClick={() => onSelect('')}>Clear</Button></div>}
    {query.length >= 2 && <div className="admin-movie-suggestions" aria-live="polite">
      {search.isPending ? <p>Searching movies…</p> : search.isError ? <p>Movie search is unavailable. <Button type="button" onClick={() => void search.refetch()}>Retry</Button></p>
        : !search.data?.data.length ? <p>No matching movies.</p> : <><p>Matching movies</p><ul>{search.data.data.slice(0, 6).map(movie => <li key={movie.tmdb_id}><button type="button" onClick={() => { onSelect(String(movie.tmdb_id)); setDraft(''); setQuery('') }}>{movie.title}{releaseYear(movie.release_date) ? ` · ${releaseYear(movie.release_date)}` : ''}</button></li>)}</ul></>}
    </div>}
  </div>
}
