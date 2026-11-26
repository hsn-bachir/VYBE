import type { QueryClient } from '@tanstack/react-query'
import { accessKey } from '../../auth/hooks/useAccess'
import { requestContext } from './cache'
import { nightOptions } from './useMovieNights'

// Capture identities/counters, not private DTO snapshots or response timestamps.
export function finalizationAdmission(client: QueryClient, owner: number, id: number) {
  const votesKey = nightOptions(client, owner, { kind: 'votes', id }).queryKey
  const detailKey = nightOptions(client, owner, { kind: 'detail', id }).queryKey
  const access = accessKey(owner), cache = client.getQueryCache()
  const votesQuery = cache.find({ queryKey: votesKey }), accessQuery = cache.find({ queryKey: access })
  const revision = votesQuery?.state.dataUpdateCount ?? 0, accessRevision = accessQuery?.state.dataUpdateCount
  const context = requestContext(client, owner, id)
  let active = true
  return {
    revision,
    retire: () => { active = false },
    isCurrent: () => {
      const votes = client.getQueryState(votesKey), account = client.getQueryState(access)
      return active && context.isCurrent() && !!votesQuery && !!accessQuery
        && cache.find({ queryKey: votesKey }) === votesQuery && cache.find({ queryKey: access }) === accessQuery
        && votes?.dataUpdateCount === revision && account?.dataUpdateCount === accessRevision
        && votes?.status === 'success' && !votes.isInvalidated && votes.fetchStatus === 'idle'
        && !!votes.data && votes.data.total_votes > 0 && votes.data.leaders.length > 0
        && client.getQueryData<{ account_status: string }>(access)?.account_status === 'active'
        && client.getQueryData(detailKey)?.status === 'scheduled'
    },
  }
}
export type FinalizationAdmission = ReturnType<typeof finalizationAdmission>
