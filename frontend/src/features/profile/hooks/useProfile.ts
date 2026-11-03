import axios from 'axios'
import { useEffect } from 'react'
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { changeProfile, readProfile } from '../api/profileApi'
import type { Profile, ProfileOperation } from '../types/profile.types'
import { profileKey } from './profileKeys'
export { profileKey } from './profileKeys'

export const profileOptions = (owner: number) => queryOptions({ queryKey: profileKey(owner), queryFn: ({ signal }) => readProfile(signal), enabled: owner > 0, staleTime: 30_000, retry: false, refetchOnWindowFocus: false })
const current = (client: QueryClient, owner: number) => { const user = client.getQueryData<User | null>(authKey); return user?.id === owner && Boolean(user.email_verified_at) }
const authors = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'movies' && query.queryKey[1] === 'reviews' || query.queryKey[0] === 'me' && query.queryKey[2] === 'review' }
export async function synchronizeProfile(client: QueryClient, owner: number, profile: Profile): Promise<boolean> {
  if (!current(client, owner) || profile.user.id !== owner) return false
  await Promise.all([client.cancelQueries({ queryKey: authKey, exact: true }), client.cancelQueries({ queryKey: profileKey(owner), exact: true }), client.cancelQueries(authors)])
  if (!current(client, owner)) return false
  client.setQueryData(authKey, profile.user); client.setQueryData(profileKey(owner), profile)
  await client.invalidateQueries(authors)
  return current(client, owner)
}
export function useProfileAccess(error: unknown, owner: number) {
  const client = useQueryClient()
  useEffect(() => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (!owner || !current(client, owner) || (status !== 401 && status !== 403)) return
    if (status === 401) client.setQueryData(authKey, null)
    void client.cancelQueries({ queryKey: profileKey(owner) }).then(() => client.removeQueries({ queryKey: profileKey(owner) }))
    void client.invalidateQueries({ queryKey: authKey })
  }, [client, error, owner])
}
export function useProfileMutation(owner: number, onConfirmed: (operation: ProfileOperation) => void) {
  const client = useQueryClient()
  const result = useMutation({ mutationKey: ['me', owner, 'profile-write'], scope: { id: `profile:${owner}` }, retry: false,
    mutationFn: (operation: ProfileOperation) => changeProfile(operation, () => current(client, owner)),
    onSuccess: async (profile, operation) => { if (await synchronizeProfile(client, owner, profile)) onConfirmed(operation) },
  })
  useProfileAccess(result.error, owner)
  return result
}
