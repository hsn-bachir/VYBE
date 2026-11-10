import axios from 'axios'
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import type { User } from '../../auth/types/auth.types'
import { adminIdentityMethods, adminUser, adminUsers, changeAdminUser, changeAdminPassword, createAdminUser, resendAdminInvitation, sendAdminPasswordReset, type PasswordChange, type UserChange, type UserFilters } from '../api/adminUsersApi'

export const adminKeys = {
  root: (owner: number) => ['admin', owner] as const,
  users: (owner: number, filters: UserFilters) => ['admin', owner, 'users', filters] as const,
  user: (owner: number, id: number) => ['admin', owner, 'user', id] as const,
}
export function useAdminAccessError(error: unknown, owner: number) {
  const client = useQueryClient()
  useEffect(() => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (!owner || (status !== 401 && status !== 403) || client.getQueryData<User | null>(authKey)?.id !== owner) return
    if (status === 401) client.setQueryData(authKey, null)
    void client.cancelQueries({ queryKey: adminKeys.root(owner) }).then(() => {
      client.removeQueries({ queryKey: adminKeys.root(owner) })
      void client.invalidateQueries({ queryKey: authKey })
      if (status === 403) void client.invalidateQueries({ queryKey: accessKey(owner) })
    })
  }, [client, error, owner])
}
export function useAdminUsers(owner: number, filters: UserFilters) {
  const result = useQuery({ queryKey: adminKeys.users(owner, filters), queryFn: ({ signal }) => adminUsers(filters, signal),
    enabled: owner > 0 && (!filters.q || filters.q.length >= 3), retry: false, staleTime: 0 })
  useAdminAccessError(result.error, owner)
  return result
}
export function useAdminUser(owner: number, id: number) {
  const result = useQuery({ queryKey: adminKeys.user(owner, id), queryFn: ({ signal }) => adminUser(id, signal),
    enabled: owner > 0 && id > 0, retry: false, staleTime: 0 })
  useAdminAccessError(result.error, owner)
  return result
}
export function useAdminIdentityMethods(owner: number, id: number, actionVisible: boolean) {
  const result = useQuery({ queryKey: [...adminKeys.user(owner, id), 'identity-methods'], queryFn: ({ signal }) => adminIdentityMethods(id, signal),
    enabled: import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase' && owner > 0 && id > 0 && actionVisible,
    retry: false, staleTime: 60_000 })
  useAdminAccessError(result.error, owner)
  return result
}
export function useAdminUserChange(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: (change: UserChange) => changeAdminUser(change, current),
    onSuccess: async (user) => {
      if (!current()) return
      await client.invalidateQueries({ queryKey: adminKeys.root(owner) })
      if (!current()) return
      if (user.id === owner) {
        await client.invalidateQueries({ queryKey: authKey })
        if (current()) await client.invalidateQueries({ queryKey: accessKey(owner) })
      }
    },
  })
  useAdminAccessError(result.error, owner)
  return result
}
export function useCreateAdminUser(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: (values: { username: string; email: string; role?: 'user' | 'moderator' }) => createAdminUser(values, current),
    onSuccess: async () => { if (current()) await client.invalidateQueries({ queryKey: adminKeys.root(owner) }) },
  })
  useAdminAccessError(result.error, owner)
  return result
}
export function useResendAdminInvitation(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: (id: number) => resendAdminInvitation(id, current),
    onSuccess: async () => { if (current()) await client.invalidateQueries({ queryKey: adminKeys.root(owner) }) },
  })
  useAdminAccessError(result.error, owner)
  return result
}
export function useChangeAdminPassword(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: ({ id, values }: { id: number; values: PasswordChange }) => changeAdminPassword(id, values, current),
    onSuccess: async () => { if (current()) await client.invalidateQueries({ queryKey: adminKeys.root(owner) }) },
  })
  useAdminAccessError(result.error, owner)
  return result
}
export function useSendAdminPasswordReset(owner: number) {
  const client = useQueryClient()
  const current = () => client.getQueryData<User | null>(authKey)?.id === owner
  const result = useMutation({ retry: false, mutationFn: ({ id, reason }: { id: number; reason?: string }) => sendAdminPasswordReset(id, reason, current) })
  useAdminAccessError(result.error, owner)
  return result
}
