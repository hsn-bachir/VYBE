import { useEffect } from 'react'
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { changeReview, personalReview, reviewsPage, reviewStatus } from '../api/reviewsApi'
import type { Review, ReviewOperation } from '../types/review.types'

export const reviewKeys = {
  lists: (movie: number) => ['movies', 'reviews', movie] as const,
  page: (movie: number, page: number, perPage: number) => ['movies', 'reviews', movie, page, perPage] as const,
  owner: (owner: number) => ['me', owner, 'review'] as const,
  own: (owner: number, movie: number) => ['me', owner, 'review', movie] as const,
  write: (owner: number, movie: number) => ['me', owner, 'review-write', movie] as const,
}
const policy = { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } as const
export const reviewsOptions = (movie: number, page: number, perPage = 20) => queryOptions({ ...policy, queryKey: reviewKeys.page(movie, page, perPage), queryFn: ({ signal }) => reviewsPage(movie, page, perPage, signal), enabled: movie > 0 })
export const personalReviewOptions = (owner: number, movie: number) => queryOptions({ ...policy, queryKey: reviewKeys.own(owner, movie), queryFn: ({ signal }) => personalReview(movie, signal), enabled: owner > 0 && movie > 0 })
const isCurrent = (client: QueryClient, owner: number) => { const user = client.getQueryData<User | null>(authKey); return user?.id === owner && Boolean(user.email_verified_at) }

export async function synchronizeReview(client: QueryClient, owner: number, movie: number, result: Review | null): Promise<boolean> {
  if (!isCurrent(client, owner)) return false
  await Promise.all([client.cancelQueries({ queryKey: reviewKeys.own(owner, movie), exact: true }), client.cancelQueries({ queryKey: reviewKeys.lists(movie) })])
  if (!isCurrent(client, owner)) return false
  client.setQueryData(reviewKeys.own(owner, movie), result)
  await Promise.all([client.invalidateQueries({ queryKey: reviewKeys.own(owner, movie), exact: true }), client.invalidateQueries({ queryKey: reviewKeys.lists(movie) })])
  return isCurrent(client, owner)
}
export function useReviewAccessError(error: unknown, owner: number) {
  const client = useQueryClient()
  useEffect(() => {
    const status = reviewStatus(error)
    if (!owner || !isCurrent(client, owner) || (status !== 401 && status !== 403)) return
    if (status === 401) client.setQueryData(authKey, null)
    void client.cancelQueries({ queryKey: reviewKeys.owner(owner) }).then(() => client.removeQueries({ queryKey: reviewKeys.owner(owner) }))
    void client.invalidateQueries({ queryKey: authKey })
  }, [client, error, owner])
}
export function useReviewMutation(owner: number, movie: number, onConfirmed: (operation: ReviewOperation) => void) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationKey: reviewKeys.write(owner, movie), scope: { id: `review:${owner}:${movie}` }, retry: false,
    mutationFn: (operation: ReviewOperation) => changeReview(movie, operation, () => isCurrent(client, owner)),
    onSuccess: async (result, operation) => { if (await synchronizeReview(client, owner, movie, result)) onConfirmed(operation) },
    onError: async error => {
      if (!isCurrent(client, owner)) return
      if (reviewStatus(error) === 409 || reviewStatus(error) === 404) await Promise.all([
        client.invalidateQueries({ queryKey: reviewKeys.own(owner, movie), exact: true }), client.invalidateQueries({ queryKey: reviewKeys.lists(movie) }),
      ])
    },
  })
  useReviewAccessError(mutation.error, owner)
  return mutation
}
