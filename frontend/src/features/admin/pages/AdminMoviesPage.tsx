import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../auth/hooks/useAuth'
import { moderationError } from '../../moderation/api/moderationApi'
import { MovieImage } from '../../movies/components/MovieImage'
import { MovieRating } from '../../movies/components/MovieRating'
import { AdminNotice, AdminShell } from '../components/AdminShell'
import { useManagedMovies } from '../hooks/useAdminMovies'
import '../components/admin-movies.css'

export default function AdminMoviesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const filters = { q: params.get('q') ?? '', status: params.get('status') ?? 'all', page: Math.max(1, Number(params.get('page')) || 1) }
  const query = useManagedMovies(useAuth().data?.id ?? 0, filters)
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); if (key !== 'page') next.delete('page'); setParams(next) }
  return <AdminShell>
    <div className="admin-heading"><div><h1>Movie Management</h1><p>Inspect and maintain movies stored in VYBE.</p></div></div>
    <form className="admin-filters admin-movie-filters" onSubmit={event => { event.preventDefault(); update('q', search.trim()) }}>
      <Input id="admin-movie-search" label="Search title or TMDB ID" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} />
      <div className="field"><label htmlFor="movie-health">Metadata health</label><select id="movie-health" value={filters.status} onChange={event => update('status', event.target.value)}>
        {['all', 'fresh', 'stale', 'not_hydrated', 'missing_poster', 'missing_overview', 'unknown_genres'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
      </select></div><Button type="submit">Search</Button>
    </form>
    {query.isPending ? <div role="status" aria-label="Loading stored movies" className="admin-panel"><div className="admin-skeleton-row skeleton" /><div className="admin-skeleton-row skeleton" /></div>
      : query.isError ? <><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></>
        : !query.data?.data.length ? <AdminNotice>No stored movies match these filters.</AdminNotice> : <>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Movie</th><th>Genres</th><th>TMDB rating</th><th>Metadata</th><th>Last full fetch</th></tr></thead><tbody>
            {query.data.data.map(movie => <tr key={movie.tmdb_id}>
              <td data-label="Movie"><div className="admin-managed-title"><div className="admin-rank-poster"><MovieImage path={movie.poster_path} title={movie.title} /></div><div><Link to={`/admin/movies/${movie.tmdb_id}`}>{movie.title}</Link><small>#{movie.tmdb_id} · {movie.release_date?.slice(0, 4) ?? 'Year unavailable'}</small></div></div></td>
              <td data-label="Genres">{movie.genres === null ? 'Unknown genres' : movie.genres.map(genre => genre.name).join(', ') || 'No genres'}</td>
              <td data-label="TMDB rating"><MovieRating rating={movie.tmdb_rating} votes={movie.tmdb_vote_count} /></td>
              <td data-label="Metadata">{movie.metadata_status.replaceAll('_', ' ')}</td>
              <td data-label="Last full fetch">{movie.metadata_fetched_at ? new Date(movie.metadata_fetched_at).toLocaleString() : 'Never'}</td>
            </tr>)}
          </tbody></table></div>
          <div className="admin-pagination"><span>{query.data.meta.total_results} movies · Page {filters.page} of {query.data.meta.total_pages}</span><div><Button disabled={filters.page <= 1} onClick={() => update('page', String(filters.page - 1))}>Previous</Button><Button disabled={filters.page >= query.data.meta.total_pages} onClick={() => update('page', String(filters.page + 1))}>Next</Button></div></div>
        </>}
  </AdminShell>
}
