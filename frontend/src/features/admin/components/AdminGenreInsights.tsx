import { Button } from '../../../components/ui/Button'
import { moderationError } from '../../moderation/api/moderationApi'
import { useAdminGenreInsights } from '../hooks/useAdminAnalytics'
import { AdminNotice } from './AdminShell'
import './admin-analytics.css'

export function AdminGenreInsights({ owner }: { owner: number }) {
  const query = useAdminGenreInsights(owner)
  const result = query.data
  const coverage = result?.meta
  const maximum = result?.data[0]?.watched_entries ?? 0

  return <section className="admin-panel admin-genres" aria-labelledby="admin-popular-genres">
    <h2 id="admin-popular-genres">Popular Genres</h2>
    <p className="admin-hint">Each watched entry counts once toward every genre on its movie.</p>
    {query.isPending ? <div role="status" aria-label="Loading popular genres">
      {[0, 1, 2].map(index => <div key={index} className="admin-analytics-skeleton skeleton" aria-hidden="true" />)}
    </div> : query.isError ? <div className="admin-insights-feedback">
      <AdminNotice error>{moderationError(query.error)}</AdminNotice>
      <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Retry popular genres</Button>
    </div> : coverage && result && (coverage.cohort_movies === 0 ? <AdminNotice>No watched entries to rank by genre yet.</AdminNotice> : <>
      <div className="admin-genre-coverage">
        <p><strong>Up to {coverage.cohort_limit} most-watched movies.</strong> {coverage.cohort_movies.toLocaleString()} of {coverage.total_watched_movies.toLocaleString()} watched movies and {coverage.cohort_watched_entries.toLocaleString()} of {coverage.total_watched_entries.toLocaleString()} watched entries are in this group.</p>
        <p>Cached genre data covers <strong>{coverage.covered_movies.toLocaleString()} of {coverage.cohort_movies.toLocaleString()} movies</strong> and <strong>{coverage.covered_watched_entries.toLocaleString()} of {coverage.cohort_watched_entries.toLocaleString()} watched entries</strong> in this group.</p>
      </div>
      {coverage.metadata_unavailable ? <div className="admin-insights-feedback">
        <AdminNotice error>Genre metadata is temporarily unavailable.</AdminNotice>
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Retry genre metadata</Button>
      </div> : <>
        {coverage.covered_movies === 0 ? <AdminNotice>Cached genre data is missing for every movie in this group.</AdminNotice>
          : coverage.covered_movies < coverage.cohort_movies && <AdminNotice>Some movies are missing cached genre data. The ranking uses the available data.</AdminNotice>}
        {coverage.covered_movies > 0 && result.data.length === 0 && <p className="admin-hint">No genres are available to rank for this group.</p>}
      </>}
      {maximum > 0 && <ol className="admin-genre-list" role="list" aria-label="Genre ranking by watched entries">{result.data.map((genre, index) => <li key={genre.genre_id}>
        <span className="admin-rank-position"><span className="sr-only">Rank </span>{index + 1}</span>
        <strong>{genre.name}</strong>
        <span className="admin-genre-track" aria-hidden="true"><span style={{ width: `${genre.watched_entries / maximum * 100}%` }} /></span>
        <span className="admin-genre-count">{genre.watched_entries.toLocaleString()}<span className="sr-only"> watched entries</span></span>
      </li>)}</ol>}
    </>)}
  </section>
}
