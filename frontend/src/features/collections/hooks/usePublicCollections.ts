import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { publicProfileId } from '../../profile/api/publicProfileApi'
import { publicCollection, publicCollectionMovies, publicCollections, publicPage } from '../api/publicCollectionsApi'
import type { PublicCollection } from '../types/publicCollection.types'

export const publicCollectionKeys = {
  author: (id: number) => ['public-collections', 'author', id] as const,
  detail: (id: number) => ['public-collections', 'collection', id] as const,
  movies: (id: number, page: number) => ['public-collections', 'collection', id, 'movies', page] as const,
}
const policy = { staleTime: 0, gcTime: 0, retry: false, retryOnMount: false, refetchOnMount: 'always', refetchOnWindowFocus: true } as const
const valid = (id: number, page = 1) => publicProfileId(String(id)) === id && publicPage(String(page)) === page
export const publicCollectionsOptions = (id: number, page: number) => queryOptions({ ...policy,
  queryKey: [...publicCollectionKeys.author(id), page], queryFn: ({ signal }) => publicCollections(id, page, signal), enabled: valid(id, page),
})
export const publicCollectionOptions = (id: number) => queryOptions({ ...policy,
  queryKey: publicCollectionKeys.detail(id), queryFn: ({ signal }) => publicCollection(id, signal), enabled: valid(id),
})
export const publicCollectionMoviesOptions = (id: number, page: number) => queryOptions({ ...policy,
  queryKey: publicCollectionKeys.movies(id, page), queryFn: ({ signal }) => publicCollectionMovies(id, page, signal), enabled: valid(id, page),
})

export const publicCreatorFilter = (owner: number) => ({ predicate: (query: { queryKey: readonly unknown[]; state: { data: unknown } }) =>
  query.queryKey[0] === 'public-collections' && (query.queryKey[1] === 'author' && query.queryKey[2] === owner
    || query.queryKey[1] === 'collection' && query.queryKey.length === 3 && (query.state.data as PublicCollection | undefined)?.creator?.id === owner),
})

// Reset active observers as well as evicting inactive entries: removal alone can leave
// an observer rendering its old result. Cancellation prevents late responses restoring it.
export async function refreshPublicCollections(client: QueryClient, owner: number, id: number | undefined, isCurrent: () => boolean) {
  const filter = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'public-collections'
    && (query.queryKey[1] === 'author' && query.queryKey[2] === owner || id !== undefined && query.queryKey[1] === 'collection' && query.queryKey[2] === id) }
  await client.cancelQueries(filter)
  if (!isCurrent()) return false
  client.removeQueries({ ...filter, type: 'inactive' })
  void client.resetQueries({ ...filter, type: 'active' })
  return true
}
