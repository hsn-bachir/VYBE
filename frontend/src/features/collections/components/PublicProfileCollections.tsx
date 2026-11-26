import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { publicCollectionFailure, publicPage } from '../api/publicCollectionsApi'
import { publicCollectionsOptions } from '../hooks/usePublicCollections'
import { CollectionCard, CollectionCardSkeleton } from './CollectionCard'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { MovieState } from '../../movies/components/MovieState'
import '../collections.css'

export function PublicProfileCollections({ id }: { id: number }) {
  const [params] = useSearchParams()
  const page = publicPage(params.get('page'))
  const result = useQuery({ ...publicCollectionsOptions(id, page ?? 1), enabled: page !== null })
  const failure = result.isError ? publicCollectionFailure(result.error) : null
  return <section className="public-profile-collections" aria-labelledby="public-collections-title"><div className="section-heading"><h2 id="public-collections-title">Public collections<span className="accent-period">.</span></h2></div>
    {page === null ? <MovieState title="Invalid page"><Link to={`/users/${id}`}>Go to the first page</Link></MovieState>
      : failure ? <MovieState title={failure.title} retry={failure.retry ? () => void result.refetch() : undefined}>{failure.message}</MovieState>
        : result.isPending ? <ul className="collection-grid" aria-label="Loading public collections">{[1, 2, 3].map(i => <CollectionCardSkeleton key={i} />)}</ul>
          : result.data && <>
            {result.data.meta.preview_metadata_unavailable && <p className="collection-public-notice" role="status">Poster information is temporarily unavailable. Collections are still available.</p>}
            {result.data.data.length ? <ul className="collection-grid">{result.data.data.map(collection => <CollectionCard key={collection.id} collection={collection} publicView />)}</ul>
              : <MovieState title={page > 1 ? 'No collections on this page.' : 'No public collections yet.'}>Private collections are only visible to their owner.</MovieState>}
            <MoviePagination page={page} totalPages={result.data.meta.total_pages} preserveState />
          </>}
  </section>
}
