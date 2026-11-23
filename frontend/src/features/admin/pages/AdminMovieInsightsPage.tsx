import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { moderationError } from '../../moderation/api/moderationApi'
import { releaseYear } from '../../movies/api/images'
import { MovieImage } from '../../movies/components/MovieImage'
import type { HighestRatedMovie, MostWatchedMovie } from '../api/adminMovieInsightsApi'
import { AdminNotice, AdminShell } from '../components/AdminShell'
import { useAdminMovieInsights } from '../hooks/useAdminMovieInsights'

type RankedMovie = MostWatchedMovie | HighestRatedMovie

function Ranking({ id, title, description, empty, rows }: {
  id: string; title: string; description: string; empty: string; rows?: RankedMovie[]
}) {
  return <section className="admin-panel admin-ranking" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <p className="admin-hint">{description}</p>
    {rows === undefined ? <div role="status" aria-label={`Loading ${title.toLowerCase()}`}>
      {[0, 1, 2].map(index => <div key={index} className="admin-ranking-skeleton skeleton" aria-hidden="true" />)}
    </div> : rows.length === 0 ? <AdminNotice>{empty}</AdminNotice>
      : <ol className="admin-ranked-list" role="list">{rows.map((row, index) => {
        const title = row.movie?.title ?? `Movie #${row.tmdb_id}`
        const year = releaseYear(row.movie?.release_date ?? null)
        return <li key={row.tmdb_id}>
          <span className="admin-rank-position"><span className="sr-only">Rank </span>{index + 1}</span>
          <div className="admin-rank-poster" aria-hidden="true"><MovieImage path={row.movie?.poster_path ?? null} title={title} /></div>
          <div className="admin-rank-title"><Link to={`/movies/${row.tmdb_id}`}>{title}</Link>{year && <span>{year}</span>}</div>
          <div className="admin-rank-metric">{'watched_users' in row ? <>
            <strong>{row.watched_users.toLocaleString()}</strong><span>{row.watched_users === 1 ? 'viewer' : 'viewers'}</span>
          </> : <>
            <strong><span className="admin-rank-star" aria-hidden="true">★</span> {row.average_rating.toFixed(2)} <small>/ 5</small></strong>
            <span>{row.rating_count.toLocaleString()} {row.rating_count === 1 ? 'rating' : 'ratings'}</span>
          </>}</div>
        </li>
      })}</ol>}
  </section>
}

export default function AdminMovieInsightsPage() {
  const query = useAdminMovieInsights(useAuth().data?.id ?? 0)
  const result = query.data

  return <AdminShell>
    <div className="admin-heading"><div><h1>Movie Insights</h1><p>See what VYBE members watch and rate.</p></div></div>
    {query.isError ? <div className="admin-insights-feedback">
      <AdminNotice error>{moderationError(query.error)}</AdminNotice>
      <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Try again</Button>
    </div> : <>
      {result?.meta.metadata_unavailable && <div className="admin-insights-feedback">
        <AdminNotice>Movie details are temporarily unavailable. Rankings and counts are still available.</AdminNotice>
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Retry movie details</Button>
      </div>}
      <div className="admin-insights-grid">
        <Ranking id="admin-most-watched" title="Most Watched Movies" description="Ranked by how many members marked each movie as watched."
          empty="No movies have been marked as watched yet." rows={result?.data.most_watched} />
        <Ranking id="admin-highest-rated" title="Highest Rated Movies" description="VYBE community ratings, weighted by rating count."
          empty="No VYBE community ratings yet." rows={result?.data.highest_rated} />
      </div>
    </>}
  </AdminShell>
}
