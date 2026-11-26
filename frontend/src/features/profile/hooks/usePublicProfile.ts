import { queryOptions } from '@tanstack/react-query'
import { publicProfileId, readPublicProfile } from '../api/publicProfileApi'
import { publicProfileKey } from './profileKeys'

export const publicProfileOptions = (id: number) => queryOptions({
  queryKey: publicProfileKey(id), queryFn: ({ signal }) => readPublicProfile(id, signal),
  enabled: publicProfileId(String(id)) === id,
  staleTime: 0, gcTime: 0, retry: false, retryOnMount: false, refetchOnMount: 'always',
  refetchOnWindowFocus: true, refetchOnReconnect: false,
})
