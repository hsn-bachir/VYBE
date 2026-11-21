import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { LibraryHeader } from '../../library/components/LibraryHeader'
import { useLibraryAccessError } from '../../library/hooks/useLibrary'
import type { LibraryEntry } from '../../library/types/library.types'
import { MovieCard } from '../../movies/components/MovieCard'
import { MovieGridSkeleton } from '../../movies/components/MovieGrid'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { MovieState } from '../../movies/components/MovieState'
import { collectionError } from '../api/collectionsApi'
import { collectionOptions, collectionMoviesOptions, useCollectionMutation } from '../hooks/useCollections'
import { CollectionEditor } from '../components/CollectionEditor'
import { DeleteCollectionDialog } from '../components/DeleteCollectionDialog'
import '../collections.css'

function CollectionMovie({ entry, owner, id, onRemoved }: { entry: LibraryEntry; owner: number; id: number; onRemoved: () => void }) {
  const mutation = useCollectionMutation(owner, onRemoved, { id, movie: entry.tmdb_id })
  const controls = <div className="library-card-controls"><Button disabled={mutation.isPending} aria-label={`Remove ${entry.movie?.title ?? `TMDB ${entry.tmdb_id}`} from collection`} onClick={() => mutation.mutate({ action: 'membership', id, tmdbId: entry.tmdb_id, add: false })}>{mutation.isPending ? 'Removing…' : 'Remove'}</Button>{mutation.isError && <p role="alert">{collectionError(mutation.error, true)}</p>}</div>
  return entry.movie ? <MovieCard movie={entry.movie}>{controls}</MovieCard> : <li className="library-missing"><div className="library-missing-copy"><span className="eyebrow">Saved movie</span><h3>TMDB {entry.tmdb_id}</h3><p>{entry.metadata_status === 'unavailable' ? 'Movie information is temporarily unavailable.' : 'Movie information is missing from the catalog.'}</p><Link to={`/movies/${entry.tmdb_id}`}>Open movie details ↗</Link></div>{controls}</li>
}

export default function CollectionDetailsPage() {
  const auth = useAuth()
  const owner = auth.data?.email_verified_at ? auth.data.id : 0
  const { id: rawId = '' } = useParams()
  const id = /^[1-9]\d*$/.test(rawId) && Number(rawId) <= 2147483647 ? Number(rawId) : 0
  return <CollectionDetailsContent key={`${owner}:${id}`} owner={owner} id={id} />
}

function CollectionDetailsContent({ owner, id }: { owner: number; id: number }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawPage = params.get('page') ?? '1'
  const validPage = /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 10000
  const page = validPage ? Number(rawPage) : 1
  const detail = useQuery(collectionOptions(owner, id))
  const movies = useQuery({ ...collectionMoviesOptions(owner, id, page), enabled: owner > 0 && id > 0 && validPage })
  useLibraryAccessError(detail.error ?? movies.error, owner)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const c = detail.data
  return <section className="personal-library collection-detail"><LibraryHeader /><Link className="text-link collection-back" to={c?.system_key ? '/library' : '/library/collections'}>← Back to collections</Link>
    {!id ? <MovieState title="This collection is out of frame.">Choose a collection from your library.</MovieState>
      : detail.isPending ? <div className="collection-skeleton skeleton" role="status">Opening collection…</div>
        : detail.isError ? <MovieState title="Collection unavailable" retry={() => void detail.refetch()}>{collectionError(detail.error)}</MovieState>
          : c && <>
            <div className="collection-detail-heading"><p className="eyebrow">Private collection · {c.id}</p><h2 ref={heading} tabIndex={-1}>{c.name}</h2>{c.description && <p className="collection-description">{c.description}</p>}<p className="collection-count">{c.movie_count} {c.movie_count === 1 ? 'movie' : 'movies'}</p>
              {!c.system_key && <div className="collection-card-actions"><Button onClick={() => setEditing(true)}>Edit collection</Button><Button className="destructive" onClick={() => setDeleting(true)}>Delete collection</Button></div>}
            </div>
            {!validPage ? <MovieState title="That page is out of frame."><Link to={`/library/collections/${id}`}>Go to the first page</Link></MovieState>
              : movies.isPending ? <MovieGridSkeleton count={6} />
                : movies.isError ? <MovieState title="Your films are taking an intermission." retry={() => void movies.refetch()}>{collectionError(movies.error)}</MovieState>
                  : <>
                    {movies.data.meta.metadata_unavailable && <p className="library-notice" role="status">Movie information is temporarily unavailable. Your collection is safe, and you can still remove films. <button onClick={() => void movies.refetch()} disabled={movies.isFetching}>Retry movie information</button></p>}
                    {movies.data.data.length === 0 ? <MovieState title={page > 1 ? 'No films on this page.' : 'This collection is empty.'}>{page > 1 ? <Link to={`/library/collections/${id}`}>Go to the first page</Link> : <>Explore movies and save them here. <Link to="/discover">Discover movies</Link></>}</MovieState>
                      : <ul className="movie-grid library-grid">{movies.data.data.map(entry => <CollectionMovie key={entry.tmdb_id} entry={entry} owner={owner} id={id} onRemoved={() => {
                        setFeedback('Movie removed from this collection.'); heading.current?.focus({ preventScroll: true }); if (movies.data.data.length === 1 && page > 1) setParams({ page: String(page - 1) })
                      }} />)}</ul>}
                    <MoviePagination page={page} totalPages={movies.data.meta.total_pages} />
                  </>}
            {editing && !c.system_key && <CollectionEditor owner={owner} collection={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setFeedback('Collection updated.') }} />}
            {deleting && !c.system_key && <DeleteCollectionDialog owner={owner} collection={c} onClose={() => setDeleting(false)} onDeleted={() => navigate('/library/collections', { replace: true, state: { collectionFeedback: 'Collection deleted. Your other library memberships are unchanged.' } })} />}
          </>}
    <div className="library-feedback" role="status">{feedback && <>{feedback}<button aria-label="Dismiss notification" onClick={() => setFeedback('')}>×</button></>}</div>
  </section>
}
