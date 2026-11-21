import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { authenticate, currentUser, logout } from '../api/authApi'
import type { Credentials, Registration, User } from '../types/auth.types'

export const authKey = ['auth', 'me'] as const
const publicMovieKinds = new Set(['popular', 'popular-feed', 'search', 'search-feed', 'detail', 'experience'])
export const isPrivateSessionQuery = (query: { queryKey: readonly unknown[] }) =>
  query.queryKey[0] !== 'auth' && !(query.queryKey[0] === 'movies' && publicMovieKinds.has(String(query.queryKey[1])))

async function clearPrivateSessionQueries(client: QueryClient) {
  await client.cancelQueries({ predicate: isPrivateSessionQuery })
  client.removeQueries({ predicate: isPrivateSessionQuery })
}
export async function storeAuthenticatedUser(client: QueryClient, user: User) {
  await clearPrivateSessionQueries(client)
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
    await clearPrivateSessionQueries(client)
    client.setQueryData(authKey, null)
  } })
}
