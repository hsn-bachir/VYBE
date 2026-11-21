import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '../../../lib/api/client'
import { authKey, isPrivateSessionQuery } from './useAuth'

export type Access = { role: 'user' | 'moderator' | 'admin'; account_status: 'active' | 'restricted' | 'banned' | 'deactivated' }
export const accessKey = (userId: number) => ['me', userId, 'access'] as const
export async function currentAccess(signal?: AbortSignal): Promise<Access> {
  return (await api.get<{ data: Access }>('/api/v1/me/access', { signal })).data.data
}

export function useAccess(userId: number | undefined, verified: boolean) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: accessKey(userId ?? 0),
    queryFn: ({ signal }) => currentAccess(signal),
    enabled: !!userId && verified,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (!axios.isAxiosError(query.error)) return
    if (query.error.response?.status === 401) {
      void client.cancelQueries({ predicate: isPrivateSessionQuery }).then(() => {
        client.removeQueries({ predicate: isPrivateSessionQuery })
        client.setQueryData(authKey, null)
      })
    } else if (query.error.response?.status === 403) {
      void client.invalidateQueries({ queryKey: authKey })
    }
  }, [client, query.error])
  return query
}
