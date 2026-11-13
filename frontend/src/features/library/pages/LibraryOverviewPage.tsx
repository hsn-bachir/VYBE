import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { CollectionCard, CollectionCardSkeleton } from '../../collections/components/CollectionCard'
import { collectionError } from '../../collections/api/collectionsApi'
import { collectionsOptions } from '../../collections/hooks/useCollections'
import type { Collection } from '../../collections/types/collection.types'
import { libraryError } from '../api/libraryApi'
import { LibraryHeader } from '../components/LibraryHeader'
import { libraryOptions, useLibraryAccessError } from '../hooks/useLibrary'
import type { LibraryResponse } from '../types/library.types'
import '../../collections/collections.css'
import '../library.css'

function builtIn(kind: 'watchlist' | 'watched', data: LibraryResponse): Collection {
  return {
    id: 0, name: kind === 'watchlist' ? 'Watchlist' : 'Watched', description: kind === 'watchlist' ? 'The stories waiting for you.' : 'The films that stayed with you.',
    movie_count: data.meta.total_results, created_at: null, updated_at: null,
    preview_movies: data.data.slice(0, 3).map(entry => ({ tmdb_id: entry.tmdb_id, title: entry.movie?.title ?? null, poster_path: entry.movie?.poster_path ?? null })),
  }
}

export default function LibraryOverviewPage() {
  const auth = useAuth()
  const owner = auth.data?.email_verified_at ? auth.data.id : 0
  const watchlist = useQuery({ ...libraryOptions(owner, 'watchlist', 1), enabled: owner > 0 })
  const watched = useQuery({ ...libraryOptions(owner, 'watched', 1), enabled: owner > 0 })
  const collections = useQuery({ ...collectionsOptions(owner, 1), enabled: owner > 0 })
  const favorite = collections.data?.data.find(item => item.system_key === 'favorites')
  useLibraryAccessError(watchlist.error ?? watched.error ?? collections.error, owner)
  return <section className="personal-library library-overview">
    <LibraryHeader overview />
    <div className="section-heading collection-section-heading"><div><h2>Your library, in stories<span className="accent-period">.</span></h2><p>Favorites, plans, memories, and collections made by you.</p></div><Link className="button" to="/library/collections">Manage collections</Link></div>
    <ul className="collection-grid library-overview-grid">
      {favorite ? <CollectionCard collection={favorite} /> : collections.isPending && <CollectionCardSkeleton label="Loading Favorites" />}
      {watchlist.data ? <CollectionCard collection={builtIn('watchlist', watchlist.data)} to="/library/watchlist" builtIn /> : watchlist.isPending && <CollectionCardSkeleton label="Loading Watchlist" />}
      {watched.data ? <CollectionCard collection={builtIn('watched', watched.data)} to="/library/watched" builtIn /> : watched.isPending && <CollectionCardSkeleton label="Loading Watched" />}
      {collections.data?.data.filter(item => item.system_key !== 'favorites').map(item => <CollectionCard key={item.id} collection={item} />)}
    </ul>
    {watchlist.isError && <Alert variant="error">Watchlist could not load. <Button className="compact" onClick={() => void watchlist.refetch()}>Retry</Button> {libraryError(watchlist.error)}</Alert>}
    {watched.isError && <Alert variant="error">Watched movies could not load. <Button className="compact" onClick={() => void watched.refetch()}>Retry</Button> {libraryError(watched.error)}</Alert>}
    {collections.isError && <Alert variant="error">Collections could not load. <Button className="compact" onClick={() => void collections.refetch()}>Retry</Button> {collectionError(collections.error)}</Alert>}
    {collections.data?.meta.preview_metadata_unavailable && <Alert variant="warning">Some poster previews are temporarily unavailable. Your saved movies are safe.</Alert>}
    {collections.data && collections.data.meta.total_results > collections.data.data.length && <Link className="text-link" to="/library/collections?page=2">View more collections ↗</Link>}
  </section>
}
