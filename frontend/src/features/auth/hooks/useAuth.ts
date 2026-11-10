import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { authenticate, currentUser, logout } from '../api/authApi'
import type { Credentials, Registration, User } from '../types/auth.types'

export const authKey = ['auth', 'me'] as const
export async function storeAuthenticatedUser(client: QueryClient, user: User) {
  await client.cancelQueries()
  client.removeQueries({ predicate: query => query.queryKey[0] !== 'auth' })
  client.setQueryData(authKey, user)
}
export function useAuth(staleTime = 5_000) {
  return useQuery({ queryKey: authKey, queryFn: ({ signal }) => currentUser(signal), retry: false, staleTime })
}

export function useAuthenticate(mode: 'login' | 'register') {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (values: Credentials | Registration) => authenticate(mode, values),
    onSuccess: (user: User) => storeAuthenticatedUser(client, user),
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({ mutationFn: logout, onSuccess: async () => {
    await client.cancelQueries()
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
    client.setQueryData(authKey, null)
  } })
}
