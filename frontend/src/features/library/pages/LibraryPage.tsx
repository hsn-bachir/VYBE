import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LibraryHeader } from '../components/LibraryHeader'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { MovieCard } from '../../movies/components/MovieCard'
import { MovieGridSkeleton } from '../../movies/components/MovieGrid'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { MovieState } from '../../movies/components/MovieState'
import { libraryError } from '../api/libraryApi'
import { libraryOptions, useLibraryAccessError, useMembership } from '../hooks/useLibrary'
import type { LibraryEntry, LibraryKind } from '../types/library.types'
import '../library.css'

function LibraryItem({ entry, kind, userId, onRemoved }: { entry: LibraryEntry; kind: LibraryKind; userId: number; onRemoved: () => void }) {
  const remove = useMembership(userId, kind, entry.tmdb_id, onRemoved)
  const controls = <div className="library-card-controls">
    {entry.watched_at && <p>Watched <time dateTime={entry.watched_at}>{new Date(entry.watched_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></p>}
    <Button disabled={remove.isPending} onClick={() => remove.mutate(false)} aria-label={`Remove ${entry.movie?.title ?? `TMDB ${entry.tmdb_id}`} from ${kind}`}>{remove.isPending ? 'Removing…' : 'Remove'}</Button>
    {remove.isError && <p role="alert">{libraryError(remove.error)}</p>}
  </div>
  if (entry.movie) return <MovieCard movie={entry.movie}>{controls}</MovieCard>
  return <li className="library-missing"><div className="library-missing-copy"><span className="eyebrow">Saved movie</span><h3>TMDB {entry.tmdb_id}</h3><p>{entry.metadata_status === 'unavailable' ? 'Movie information is temporarily unavailable.' : 'Movie information is missing from the catalog.'}</p><Link to={`/movies/${entry.tmdb_id}`}>Open movie details ↗</Link></div>{controls}</li>
}

export default function LibraryPage({ kind }: { kind: LibraryKind }) {
  const auth = useAuth()
  const [feedback, setFeedback] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const [params, setParams] = useSearchParams()
  const rawPage = params.get('page') ?? '1'
  const validPage = /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 10000
  const page = validPage ? Number(rawPage) : 1
  const userId = auth.data?.email_verified_at ? auth.data.id : 0
  const result = useQuery({ ...libraryOptions(userId, kind, page), enabled: userId > 0 && validPage })
  useLibraryAccessError(result.error, userId)
  const title = kind === 'watchlist' ? 'Watchlist' : 'Watched'
  return <section className="personal-library">
    <LibraryHeader />
    <div className="section-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2>{result.data && <p>{result.data.meta.total_results} {result.data.meta.total_results === 1 ? 'film' : 'films'}</p>}</div>
    {!validPage ? <MovieState title="That page is out of frame."><Link to={`/library/${kind}`}>Go to the first page</Link></MovieState>
      : result.isPending ? <MovieGridSkeleton count={6} />
        : result.isError ? <MovieState title="Your library is taking an intermission." retry={() => void result.refetch()}>{libraryError(result.error)}</MovieState>
          : <>
            {result.data.meta.metadata_unavailable && <p className="library-notice" role="status">Movie information is temporarily unavailable. Your saved films are safe, and you can still remove them. <button onClick={() => void result.refetch()} disabled={result.isFetching}>Retry movie information</button></p>}
            {result.data.data.length === 0 ? <MovieState title={page > 1 ? 'No films on this page.' : kind === 'watchlist' ? 'Your next great film starts here.' : 'Every film leaves a little something.'}>{page > 1 ? <Link to={`/library/${kind}`}>Go to the first page</Link> : <>{kind === 'watchlist' ? 'Save films you want to see.' : 'Mark a movie as watched to begin your film diary.'} <Link to="/discover">Discover movies</Link></>}</MovieState>
              : <ul className="movie-grid library-grid">{result.data.data.map(entry => <LibraryItem key={`${userId}:${kind}:${entry.tmdb_id}`} userId={userId} kind={kind} entry={entry} onRemoved={() => {
                setFeedback(`Removed from ${title}.`)
                heading.current?.focus({ preventScroll: true })
                if (result.data.data.length === 1 && page > 1) setParams({ page: String(page - 1) })
              }} />)}</ul>}
            <MoviePagination page={page} totalPages={result.data.meta.total_pages} />
          </>}
    <div className="library-feedback" role="status" aria-live="polite">{feedback && <>{feedback}<button aria-label="Dismiss notification" onClick={() => setFeedback('')}>×</button></>}</div>
  </section>
}
