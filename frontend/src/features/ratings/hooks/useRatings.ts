import axios from 'axios'
import { useEffect } from 'react'
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { changeRating, personalRating, ratingStatistics } from '../api/ratingsApi'
import type { PersonalRating, RatingOperation } from '../types/rating.types'
import { refreshRecommendations } from '../../recommendations/recommendations'

export const ratingKeys = {
  statistics: (id: number) => ['movies', 'ratings', id] as const,
  owner: (owner: number) => ['me', owner, 'rating'] as const,
  own: (owner: number, id: number) => ['me', owner, 'rating', id] as const,
  write: (owner: number, id: number) => ['me', owner, 'rating-write', id] as const,
}
const policy = { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } as const
export const statisticsOptions = (id: number) => queryOptions({ ...policy, queryKey: ratingKeys.statistics(id), queryFn: ({ signal }) => ratingStatistics(id, signal), enabled: id > 0 })
export const personalRatingOptions = (owner: number, id: number) => queryOptions({ ...policy, queryKey: ratingKeys.own(owner, id), queryFn: ({ signal }) => personalRating(id, signal), enabled: owner > 0 && id > 0 })
const isCurrent = (client: QueryClient, owner: number) => {
  const user = client.getQueryData<User | null>(authKey)
  return user?.id === owner && Boolean(user.email_verified_at)
}

export async function synchronizeRating(client: QueryClient, owner: number, id: number, result: PersonalRating | null): Promise<boolean> {
  if (!isCurrent(client, owner)) return false
  await Promise.all([client.cancelQueries({ queryKey: ratingKeys.own(owner, id), exact: true }), client.cancelQueries({ queryKey: ratingKeys.statistics(id), exact: true })])
  if (!isCurrent(client, owner)) return false
  client.setQueryData(ratingKeys.own(owner, id), result)
  void refreshRecommendations(client, owner, result ? id : undefined)
  void client.invalidateQueries({ queryKey: ratingKeys.own(owner, id), exact: true })
  void client.invalidateQueries({ queryKey: ratingKeys.statistics(id), exact: true })
  return isCurrent(client, owner)
}

export function useRatingAccessError(error: unknown, owner: number) {
  const client = useQueryClient()
  useEffect(() => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (!owner || !isCurrent(client, owner) || (status !== 401 && status !== 403)) return
    if (status === 401) client.setQueryData(authKey, null)
    void client.cancelQueries({ queryKey: ratingKeys.owner(owner) }).then(() => client.removeQueries({ queryKey: ratingKeys.owner(owner) }))
    void client.invalidateQueries({ queryKey: authKey })
  }, [client, error, owner])
}

export function useRatingMutation(owner: number, id: number, onConfirmed: (operation: RatingOperation) => void) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationKey: ratingKeys.write(owner, id), scope: { id: `rating:${owner}:${id}` }, retry: false,
    mutationFn: (operation: RatingOperation) => changeRating(id, operation, () => isCurrent(client, owner)),
    onSuccess: async (result, operation) => { if (await synchronizeRating(client, owner, id, result)) onConfirmed(operation) },
  })
  useRatingAccessError(mutation.error, owner)
  return mutation
}
