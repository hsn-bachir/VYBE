import { useIsMutating } from '@tanstack/react-query'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import type { Access } from '../../auth/hooks/useAccess'
import { useAuth } from '../../auth/hooks/useAuth'
import { moderationError } from '../../moderation/api/moderationApi'
import { MovieImage } from '../../movies/components/MovieImage'
import { MovieRating } from '../../movies/components/MovieRating'
import { AdminNotice, AdminShell } from '../components/AdminShell'
import { managedMovieKeys, useManagedMovie, useRefreshMovie } from '../hooks/useAdminMovies'
import '../components/admin-movies.css'

export default function AdminMovieDetailsPage() {
  const id = Number(useParams().tmdbId)
  const owner = useAuth().data?.id ?? 0
  const access = useOutletContext<Access>()
  const query = useManagedMovie(owner, id)
  const refresh = useRefreshMovie(owner, id)
  const pending = useIsMutating({ mutationKey: [...managedMovieKeys.detail(owner, id), 'refresh'] }) > 0
  const movie = query.data
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return <AdminShell><AdminNotice error>This movie identifier is invalid.</AdminNotice><Link to="/admin/movies">Stored movies</Link></AdminShell>
  return <AdminShell>
    <Link className="admin-back" to="/admin/movies">← Stored movies</Link>
    <div className="admin-heading"><div><h1>{movie?.title ?? 'Movie metadata'}</h1><p>Locally stored metadata for TMDB #{id}.</p></div></div>
    {query.isPending ? <div className="admin-detail-skeleton-panel skeleton" role="status" aria-label="Loading stored metadata" />
      : !movie ? <><AdminNotice error>{moderationError(query.error)}</AdminNotice><Button onClick={() => void query.refetch()}>Try again</Button></>
        : <>
          {refresh.isError && <AdminNotice error>{moderationError(refresh.error)}</AdminNotice>}
          {refresh.isSuccess && <AdminNotice>Metadata refreshed from TMDB.</AdminNotice>}
          {query.isError && <AdminNotice error>Stored metadata could not be reloaded. <Button onClick={() => void query.refetch()}>Retry</Button></AdminNotice>}
          <div className="admin-managed-detail">
            <div className="admin-managed-poster"><MovieImage path={movie.poster_path} title={movie.title} variant="poster" /></div>
            <section className="admin-panel"><h2>Metadata</h2><dl>
              {Object.entries({ 'Original title': movie.original_title, 'TMDB ID': movie.tmdb_id, 'Release date': movie.release_date,
                Runtime: movie.runtime === null ? null : `${movie.runtime} min`, Language: movie.original_language,
                Genres: movie.genres === null ? 'Unknown genres' : movie.genres.map(genre => genre.name).join(', ') || 'No genres',
                Status: movie.metadata_status.replaceAll('_', ' '), 'Last full fetch': movie.metadata_fetched_at ? new Date(movie.metadata_fetched_at).toLocaleString() : 'Never',
                'TMDB vote count': movie.tmdb_vote_count }).map(([label, value]) => <div className="admin-managed-field" key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}
            </dl><MovieRating rating={movie.tmdb_rating} votes={movie.tmdb_vote_count} />
              <div className="admin-access-actions"><Button className="primary" disabled={pending || access.account_status !== 'active'} onClick={() => { if (!pending) refresh.mutate() }}>{pending ? 'Refreshing…' : 'Refresh from TMDB'}</Button><Link className="button" to={`/movies/${id}`}>Public movie page</Link></div>
              {access.account_status !== 'active' && <p className="admin-hint">An active administrator account is required to refresh metadata.</p>}
              <p className="admin-hint">{!movie.poster_path && 'Poster unavailable. '}{!movie.overview?.trim() && 'Overview unavailable. '}</p>
            </section>
          </div>
          <section className="admin-panel admin-managed-overview"><h2>Overview</h2><p>{movie.overview || 'No overview is stored.'}</p></section>
          {movie.backdrop_path && <div className="admin-managed-backdrop"><MovieImage path={movie.backdrop_path} title={movie.title} variant="backdrop" /></div>}
        </>}
  </AdminShell>
}
