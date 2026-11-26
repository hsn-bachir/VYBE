import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { movieNightApi as api } from '../api/movieNightApi'
import { MovieNightRequestCancelled, movieNightError } from '../api/errors'
import { applyNightLifecycle, currentOwner, guardedRequest, nightKeys, purgeNight, requestContext, watchNightSession } from './cache'
import type { CandidateId, EventFields, Invitation, MovieNight, NightFilters, NightSummary, Page, Pagination, Participant, ReceivedInvitation, ShortlistPage, TmdbId, VoteTotals } from '../types/movieNight.types'

export type NightQuery =
  | { kind: 'list'; filters?: NightFilters }
  | { kind: 'received'; page?: Pagination }
  | { kind: 'detail' | 'votes'; id: number }
  | { kind: 'roster' | 'shortlist'; id: number; page?: Pagination }
  | { kind: 'eligibleUsers'; id: number; query: string; page?: Pagination }

interface QueryResults {
  list: Page<NightSummary>; received: Page<ReceivedInvitation>; detail: MovieNight; votes: VoteTotals
  roster: Page<Invitation>; shortlist: ShortlistPage; eligibleUsers: Page<Participant>
}
type ResultFor<K extends NightQuery['kind']> = QueryResults[K]
type NightQueryResult = ResultFor<NightQuery['kind']>

export function nightOptions<Q extends NightQuery>(client: QueryClient, owner: number, request: Q, enabled = true) {
  const id = 'id' in request ? request.id : undefined
  const root = id !== undefined ? nightKeys.event(owner, id) : request.kind === 'list' ? nightKeys.lists(owner) : nightKeys.inbox(owner)
  return queryOptions<ResultFor<Q['kind']>>({
    queryKey: [...root, request], retry: false, staleTime: 0, gcTime: 0,
    enabled: enabled && currentOwner(client, owner) && (id === undefined || id > 0)
      && (request.kind !== 'eligibleUsers' || /^[a-z0-9_]{3,30}$/.test(request.query.trim().toLowerCase())),
    queryFn: async ({ signal }): Promise<ResultFor<Q['kind']>> => {
      const result = await guardedRequest<NightQueryResult>(client, owner, id, context => {
        switch (request.kind) {
          case 'list': return api.list(request.filters ?? {}, context)
          case 'received': return api.received(request.page ?? {}, context)
          case 'detail': return api.detail(request.id, context)
          case 'votes': return api.votes(request.id, context)
          case 'roster': return api.roster(request.id, request.page ?? {}, context)
          case 'shortlist': return api.shortlist(request.id, request.page ?? {}, context)
          case 'eligibleUsers': return api.eligibleUsers(request.id, request.query, request.page ?? {}, context)
        }
      }, signal, request.kind === 'list' ? 'list' : request.kind === 'received' ? 'inbox' : 'read')
      // The descriptor switch above selects the matching adapter; preserve that correlation for consumers.
      return result as ResultFor<Q['kind']>
    },
  })
}
export function useMovieNightQuery<Q extends NightQuery>(request: Q, enabled = true) {
  const client = useQueryClient()
  const { data: user } = useAuth()
  const access = useAccess(user?.id, !!user?.email_verified_at)
  const canRead = access.data?.account_status === 'active' || access.data?.account_status === 'restricted'
  return useQuery(nightOptions(client, user?.id ?? 0, request, enabled && canRead))
}

export type NightMutation =
  | { kind: 'create'; fields: EventFields }
  | { kind: 'update'; id: number; fields: Partial<EventFields> }
  | { kind: 'cancel'; id: number }
  | { kind: 'invite'; id: number; invitedUserId: number }
  | { kind: 'rsvp'; id: number; status: 'accepted' | 'declined' }
  | { kind: 'nominate'; id: number; tmdbId: TmdbId }
  | { kind: 'remove' | 'vote'; id: number; candidateId: CandidateId }
  | { kind: 'finalize'; id: number; confirmed: true; tmdbId?: TmdbId }

export function nightMutationOptions(client: QueryClient, owner: number) {
  watchNightSession(client)
  return {
    mutationKey: nightKeys.owner(owner), retry: false as const, gcTime: 0,
    mutationFn: async (action: NightMutation) => {
      const id = 'id' in action ? action.id : undefined
      const lifetime = requestContext(client, owner, id)
      try {
        const result = await guardedRequest(client, owner, id, async context => {
          switch (action.kind) {
            case 'create': return api.create(action.fields, context)
            case 'update': return api.update(action.id, action.fields, context)
            case 'cancel': {
              const night = await api.cancel(action.id, context)
              if (!context.isCurrent()) throw new MovieNightRequestCancelled()
              applyNightLifecycle(client, owner, action.id, night)
              return night
            }
            case 'invite': return api.invite(action.id, action.invitedUserId, context)
            case 'rsvp': return api.rsvp(action.id, action.status, context)
            case 'nominate': return api.nominate(action.id, action.tmdbId, context)
            case 'remove': return api.remove(action.id, action.candidateId, context)
            case 'vote': return api.vote(action.id, action.candidateId, context)
            case 'finalize':
              if (action.confirmed !== true) throw new Error('Confirm irreversible finalization first.')
              {
                const night = await api.finalize(action.id, action.tmdbId, context)
                if (!context.isCurrent()) throw new MovieNightRequestCancelled()
                applyNightLifecycle(client, owner, action.id, night)
                return night
              }
          }
        })
        if (!lifetime.isCurrent()) throw new MovieNightRequestCancelled()
        if (action.kind === 'rsvp') {
          // Both directions discard prior membership projections. Accept never restores an old vote/detail.
          purgeNight(client, owner, action.id)
        } else if (action.kind !== 'cancel' && action.kind !== 'finalize') {
          // Refetch server truth; never calculate totals, permissions or winners locally.
          void client.invalidateQueries({ queryKey: nightKeys.owner(owner) })
        }
        return result
      } catch (error) {
        const info = movieNightError(error)
        if (currentOwner(client, owner) && info.refresh && id !== undefined) {
          void client.invalidateQueries({ queryKey: nightKeys.event(owner, id) })
        }
        throw error
      }
    },
  }
}
export function useMovieNightMutation() {
  const client = useQueryClient()
  const { data: user } = useAuth()
  return useMutation(nightMutationOptions(client, user?.id ?? 0))
}
