import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { publicProfileId } from '../../profile/api/publicProfileApi'
import { MovieCard } from '../../movies/components/MovieCard'
import { MovieGridSkeleton } from '../../movies/components/MovieGrid'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { MovieState } from '../../movies/components/MovieState'
import { publicCollectionFailure, publicPage } from '../api/publicCollectionsApi'
import { publicCollectionOptions, publicCollectionMoviesOptions } from '../hooks/usePublicCollections'
import '../collections.css'

export default function PublicCollectionPage() {
  const { id: rawId } = useParams()
  const id = publicProfileId(rawId)
  return id === null ? <section className="public-collection-page"><Link className="text-link collection-back" to="/discover">← Back to Discover</Link><MovieState title="Invalid collection link">Check the link or choose another collection.</MovieState></section>
    : <PublicCollectionContent key={id} id={id} />
}
function PublicCollectionContent({ id }: { id: number }) {
  const [params] = useSearchParams()
  const page = publicPage(params.get('page'))
  const detail = useQuery(publicCollectionOptions(id))
  const movies = useQuery({ ...publicCollectionMoviesOptions(id, page ?? 1), enabled: !detail.isError && Boolean(detail.data) && page !== null })
  const failure = detail.isError ? publicCollectionFailure(detail.error) : movies.isError && publicCollectionFailure(movies.error).unavailable ? publicCollectionFailure(movies.error) : null
  const c = detail.data
  return <section className="public-collection-page">
    <Link className="text-link collection-back" to={c && !failure ? `/users/${c.creator.id}` : '/discover'}>← {c && !failure ? 'Back to member profile' : 'Back to Discover'}</Link>
    {failure ? <MovieState title={failure.title} retry={failure.retry ? () => void detail.refetch() : undefined}>{failure.message}</MovieState>
      : detail.isPending ? <div className="collection-skeleton skeleton" role="status">Opening public collection…</div>
        : c && <>
          <header className="collection-detail-heading"><p className="eyebrow">Public collection</p><h1>{c.name}</h1>{c.description && <p className="collection-description">{c.description}</p>}<p className="collection-count">{c.movie_count} {c.movie_count === 1 ? 'movie' : 'movies'}</p>
            <Link className="public-collection-creator" to={`/users/${c.creator.id}`}><Avatar username={c.creator.username} url={c.creator.avatar_url} /> <span>Curated by @{c.creator.username}</span></Link>
          </header>
          {page === null ? <MovieState title="Invalid page"><Link to={`/collections/${id}`}>Go to the first page</Link></MovieState>
            : movies.isError ? <MovieState title={publicCollectionFailure(movies.error).title} retry={publicCollectionFailure(movies.error).retry ? () => void movies.refetch() : undefined}>{publicCollectionFailure(movies.error).message}</MovieState>
              : movies.isPending ? <MovieGridSkeleton count={6} />
                : <>
                  {movies.data.meta.metadata_unavailable && <p className="collection-public-notice" role="status">Movie information is temporarily unavailable. <button disabled={movies.isFetching} onClick={() => void movies.refetch()}>Retry movie information</button></p>}
                  {movies.data.data.length ? <ul className="movie-grid">{movies.data.data.map(entry => entry.movie ? <MovieCard key={entry.tmdb_id} movie={entry.movie} />
                    : <li key={entry.tmdb_id} className="public-collection-missing"><p className="eyebrow">Collection movie</p><h2>TMDB {entry.tmdb_id}</h2><p>Movie information is {entry.metadata_status === 'unavailable' ? 'temporarily unavailable' : 'missing'}.</p><Link to={`/movies/${entry.tmdb_id}`}>Open movie details ↗</Link></li>)}</ul>
                    : <MovieState title={page > 1 ? 'No movies on this page.' : 'This collection is empty.'}>{page > 1 && <Link to={`/collections/${id}`}>Go to the first page</Link>}</MovieState>}
                  <MoviePagination page={page} totalPages={movies.data.meta.total_pages} />
                </>}
        </>}
  </section>
}
