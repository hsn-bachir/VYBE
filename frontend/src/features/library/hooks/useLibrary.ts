import axios from 'axios'
import { useEffect } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import type { User } from '../../auth/types/auth.types'
import { changeMembership, libraryPage, libraryState } from '../api/libraryApi'
import type { LibraryKind, LibraryState } from '../types/library.types'
import { profileKey } from '../../profile/hooks/profileKeys'

export const libraryKeys = {
  owner: (userId: number) => ['library', userId] as const,
  list: (userId: number, kind: LibraryKind) => ['library', userId, kind] as const,
  state: (userId: number, id: number) => ['library', userId, 'state', id] as const,
}
const policy = { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } as const
export const libraryOptions = (userId: number, kind: LibraryKind, page: number) => queryOptions({
  ...policy, queryKey: [...libraryKeys.list(userId, kind), page], queryFn: ({ signal }) => libraryPage(kind, page, signal), enabled: userId > 0,
})
export const stateOptions = (userId: number, id: number) => queryOptions({
  ...policy, queryKey: libraryKeys.state(userId, id), queryFn: ({ signal }) => libraryState(id, signal), enabled: userId > 0 && id > 0,
})
export function useLibraryAccessError(error: unknown, userId: number) {
  const client = useQueryClient()
  useEffect(() => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (!userId || (status !== 401 && status !== 403) || client.getQueryData<User | null>(authKey)?.id !== userId) return
    if (status === 401) client.setQueryData(authKey, null)
    void client.invalidateQueries({ queryKey: authKey }).then(() => {
      const user = client.getQueryData<User | null>(authKey)
      if (user?.id !== userId || !user?.email_verified_at) {
        void client.cancelQueries({ queryKey: libraryKeys.owner(userId) }).then(() => client.removeQueries({ queryKey: libraryKeys.owner(userId) }))
      }
    })
  }, [client, error, userId])
}
export function useLibraryState(userId: number, id: number) {
  const result = useQuery(stateOptions(userId, id))
  useLibraryAccessError(result.error, userId)
  return result
}

export function useMembership(userId: number, kind: LibraryKind, id: number, onConfirmed?: () => void) {
  const client = useQueryClient()
  const isCurrent = () => client.getQueryData<User | null>(authKey)?.id === userId
  return useMutation({
    mutationKey: [...libraryKeys.list(userId, kind), id], retry: false,
    mutationFn: (add: boolean) => changeMembership(kind, id, add, isCurrent),
    onSuccess: async (entry, add) => {
      if (!isCurrent()) return
      await client.cancelQueries({ queryKey: libraryKeys.state(userId, id) })
      if (!isCurrent()) return
      client.setQueryData<LibraryState>(libraryKeys.state(userId, id), old => old ? {
        ...old, ...(kind === 'watchlist' ? { in_watchlist: add } : { watched_at: entry?.watched_at ?? null }),
      } : undefined)
      onConfirmed?.()
      // The server has confirmed this write and the visible state is updated.
      // Refresh other views without keeping the button pending for their network requests.
      void client.invalidateQueries({ queryKey: libraryKeys.list(userId, kind) })
      void client.invalidateQueries({ queryKey: libraryKeys.state(userId, id) })
      void client.invalidateQueries({ queryKey: profileKey(userId) })
    },
    onError: error => {
      if (!isCurrent()) return
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status === 401 || status === 403) {
        void client.cancelQueries({ queryKey: libraryKeys.owner(userId) }).then(() => client.removeQueries({ queryKey: libraryKeys.owner(userId) }))
        void client.invalidateQueries({ queryKey: authKey })
      }
    },
  })
}
