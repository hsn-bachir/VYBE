import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { libraryKeys, useLibraryAccessError } from '../../library/hooks/useLibrary'
import { changeCollection, collectionDetails, collectionMovies, collectionsPage } from '../api/collectionsApi'
import type { Collection, CollectionOperation, CollectionsResponse } from '../types/collection.types'

export const collectionKeys = {
  lists: (owner: number) => [...libraryKeys.owner(owner), 'collections'] as const,
  list: (owner: number, page: number, movie?: number) => [...libraryKeys.owner(owner), 'collections', { page, contains_tmdb_id: movie ?? null }] as const,
  detail: (owner: number, id: number) => [...libraryKeys.owner(owner), 'collection', id] as const,
  membership: (owner: number, id: number, movie: number) => [...libraryKeys.owner(owner), 'collection-write', id, movie] as const,
}
const policy = { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } as const
export const collectionsOptions = (owner: number, page: number, movie?: number) => queryOptions({
  ...policy, queryKey: collectionKeys.list(owner, page, movie), queryFn: ({ signal }) => collectionsPage(page, movie, signal), enabled: owner > 0,
})
export const collectionOptions = (owner: number, id: number) => queryOptions({
  ...policy, queryKey: collectionKeys.detail(owner, id), queryFn: ({ signal }) => collectionDetails(id, signal), enabled: owner > 0 && id > 0,
})
export const collectionMoviesOptions = (owner: number, id: number, page: number) => queryOptions({
  ...policy, queryKey: [...collectionKeys.detail(owner, id), 'movies', page], queryFn: ({ signal }) => collectionMovies(id, page, signal), enabled: owner > 0 && id > 0,
})

// Invalidate only this owner's collection views; discovery and Watchlist/Watched stay intact.
export async function synchronizeCollections(client: ReturnType<typeof useQueryClient>, owner: number, operation: CollectionOperation, result: Collection | null) {
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  if (!current()) return false
  await client.cancelQueries({ queryKey: collectionKeys.lists(owner) })
  if (!current()) return false
  if (operation.action === 'membership') {
    for (const [key, data] of client.getQueriesData<CollectionsResponse>({ queryKey: collectionKeys.lists(owner) })) {
      const options = key[3] as { contains_tmdb_id: number | null }
      if (!data || options.contains_tmdb_id !== operation.tmdbId) continue
      client.setQueryData<CollectionsResponse>(key, { ...data, data: data.data.map(c => c.id !== operation.id ? c : {
        ...c, contains_movie: operation.add,
        movie_count: Math.max(0, c.movie_count + (c.contains_movie === operation.add ? 0 : operation.add ? 1 : -1)),
      }) })
    }
  }
  if (operation.action !== 'create') {
    await client.cancelQueries({ queryKey: collectionKeys.detail(owner, operation.id) })
    if (!current()) return false
    if (operation.action === 'delete') client.removeQueries({ queryKey: collectionKeys.detail(owner, operation.id) })
    else {
      if (result) client.setQueryData(collectionKeys.detail(owner, operation.id), result)
      await client.invalidateQueries({ queryKey: collectionKeys.detail(owner, operation.id) })
    }
  }
  await client.invalidateQueries({ queryKey: collectionKeys.lists(owner) })
  return current()
}

export function useCollectionMutation(owner: number, onConfirmed?: (result: Collection | null, operation: CollectionOperation) => void, membership?: { id: number; movie: number }) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationKey: membership ? collectionKeys.membership(owner, membership.id, membership.movie) : [...libraryKeys.owner(owner), 'collection-write'],
    retry: false,
    mutationFn: (operation: CollectionOperation) => changeCollection(operation, () => client.getQueryData<User | null>(authKey)?.id === owner),
    onSuccess: async (result, operation) => {
      if (await synchronizeCollections(client, owner, operation, result)) onConfirmed?.(result, operation)
    },
  })
  useLibraryAccessError(mutation.error, owner)
  return mutation
}
