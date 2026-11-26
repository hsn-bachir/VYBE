import { QueryClient, type MutationCacheNotifyEvent } from '@tanstack/react-query'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey, type Access } from '../../auth/hooks/useAccess'
import type { User } from '../../auth/types/auth.types'
import { MovieNightRequestCancelled, movieNightError } from '../api/errors'
import type { RequestContext } from '../api/movieNightApi'
import type { MovieNight } from '../types/movieNight.types'

export const nightKeys = {
  owner: (owner: number) => ['movie-nights', owner] as const,
  lists: (owner: number) => ['movie-nights', owner, 'list'] as const,
  inbox: (owner: number) => ['movie-nights', owner, 'received'] as const,
  event: (owner: number, id: number) => ['movie-nights', owner, 'event', id] as const,
}
function removeQueries(client: QueryClient, queryKey: readonly unknown[]) {
  void client.cancelQueries({ queryKey })
  // Notify mounted observers before detaching their query; removal alone retains their previous result.
  for (const query of client.getQueryCache().findAll({ queryKey })) query.reset()
  client.removeQueries({ queryKey })
}
type ObservedMutation = Extract<MutationCacheNotifyEvent, { type: 'observerAdded' }>
interface OwnerState {
  access: number; list: number; inbox: number
  events: Map<number, { access: number; reads: number }>
}
interface SessionState {
  identity: string; generation: number; owners: Map<number, OwnerState>
  observers: Map<ObservedMutation['observer'], ObservedMutation['mutation']>
}
const sessions = new WeakMap<QueryClient, SessionState>()
const identity = (client: QueryClient) => {
  const user = client.getQueryData<User | null>(authKey)
  return user ? `${user.id}:${user.email_verified_at ?? ''}` : ''
}
function ownerState(state: SessionState, owner: number) {
  let value = state.owners.get(owner)
  if (!value) { value = { access: 0, list: 0, inbox: 0, events: new Map() }; state.owners.set(owner, value) }
  return value
}
function eventState(owner: OwnerState, id: number) {
  let value = owner.events.get(id)
  if (!value) { value = { access: 0, reads: 0 }; owner.events.set(id, value) }
  return value
}
function mutationEventId(mutation: ObservedMutation['mutation']): number | undefined {
  // Create has no event ID until its authoritative response arrives. It is unrelated to any prior event.
  const variables: unknown = mutation.state.variables
  if (!variables || typeof variables !== 'object') return undefined
  if ('id' in variables && typeof variables.id === 'number') return variables.id
  const data: unknown = mutation.state.data
  return 'kind' in variables && variables.kind === 'create' && data && typeof data === 'object'
    && 'id' in data && typeof data.id === 'number' ? data.id : undefined
}
function removeMutations(client: QueryClient, owner?: number, id?: number) {
  for (const mutation of client.getMutationCache().findAll({ mutationKey: owner === undefined ? ['movie-nights'] : nightKeys.owner(owner) })) {
    if (id === undefined || mutationEventId(mutation) === id) client.getMutationCache().remove(mutation)
  }
}
export function watchNightSession(client: QueryClient) {
  const existing = sessions.get(client)
  if (existing) return existing
  const state: SessionState = { identity: identity(client), generation: 0, owners: new Map(), observers: new Map() }
  sessions.set(client, state)
  // Register before useMutation creates/attaches its observer. Only this feature's records are affected.
  client.getMutationCache().subscribe(event => {
    if (event.type === 'observerRemoved') { state.observers.delete(event.observer); return }
    if (!('mutation' in event) || event.mutation?.options.mutationKey?.[0] !== 'movie-nights') return
    if (event.type === 'observerAdded') state.observers.set(event.observer, event.mutation)
    if (event.type === 'removed') {
      for (const [observer, mutation] of [...state.observers]) {
        if (mutation === event.mutation) observer.reset()
      }
    }
  })
  client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey
    const owner = client.getQueryData<User | null>(authKey)?.id
    if (key[0] === 'me' && key[1] === owner && key[2] === 'access') {
      const access = client.getQueryData<Access>(key)
      if (owner !== undefined && access && !['active', 'restricted'].includes(access.account_status)) {
        state.generation++
        state.owners.clear()
        removeQueries(client, ['movie-nights'])
        removeMutations(client)
      }
      return
    }
    if (key[0] !== 'auth' || key[1] !== 'me') return
    const next = identity(client)
    if (next === state.identity) return
    state.identity = next
    state.generation++
    state.owners.clear()
    // Advance guards before clearing either cache; ignored AbortSignals cannot resurrect private data.
    removeQueries(client, ['movie-nights'])
    removeMutations(client)
  })
  return state
}
export function currentOwner(client: QueryClient, owner: number) {
  const user = client.getQueryData<User | null>(authKey)
  const access = client.getQueryData<Access>(accessKey(owner))
  return owner > 0 && user?.id === owner && !!user.email_verified_at
    && (!access || ['active', 'restricted'].includes(access.account_status))
}
export type RequestScope = 'write' | 'read' | 'list' | 'inbox'
export function requestContext(client: QueryClient, owner: number, id?: number, signal?: AbortSignal, scope: RequestScope = 'write'): RequestContext {
  const state = watchNightSession(client)
  const account = ownerState(state, owner)
  const event = id === undefined ? undefined : eventState(account, id)
  const generation = state.generation
  const access = account.access
  const eventAccess = event?.access
  const revision = scope === 'read' ? event?.reads : scope === 'list' ? account.list : scope === 'inbox' ? account.inbox : undefined
  return { signal, isCurrent: () => currentOwner(client, owner) && generation === state.generation && access === account.access
    && eventAccess === event?.access
    && (scope === 'write' || revision === (scope === 'read' ? event?.reads : scope === 'list' ? account.list : account.inbox)) }
}
export function purgeNight(client: QueryClient, owner: number, id?: number) {
  const account = ownerState(watchNightSession(client), owner)
  if (id === undefined) account.access++
  else eventState(account, id).access++
  // Mixed summaries can contain revoked event fields. Their generations do not govern unrelated writes/reads.
  account.list++
  account.inbox++
  const keys = id === undefined ? [nightKeys.owner(owner)] : [nightKeys.event(owner, id), nightKeys.lists(owner), nightKeys.inbox(owner)]
  for (const queryKey of keys) removeQueries(client, queryKey)
  removeMutations(client, owner, id)
}
function queryKind(key: readonly unknown[]): unknown {
  const descriptor = key[4]
  return descriptor && typeof descriptor === 'object' && 'kind' in descriptor ? descriptor.kind : undefined
}
export function applyNightLifecycle(client: QueryClient, owner: number, id: number, night: MovieNight) {
  if (!currentOwner(client, owner) || night.id !== id || night.my_rsvp !== 'accepted'
    || night.host.id !== owner || !['cancelled', 'finalized'].includes(night.status)) return
  const account = ownerState(watchNightSession(client), owner)
  eventState(account, id).reads++
  account.list++
  account.inbox++
  // Stop older reads without invalidating concurrent server mutations, including unrelated events.
  const eventKey = nightKeys.event(owner, id)
  for (const queryKey of [eventKey, nightKeys.lists(owner), nightKeys.inbox(owner)]) void client.cancelQueries({ queryKey })
  client.setQueriesData<MovieNight>({ queryKey: eventKey, predicate: query => queryKind(query.queryKey) === 'detail' }, old =>
    old?.id === id && old.my_rsvp === 'accepted' ? night : old)
  // The response supplies the authoritative winner/status; refresh summaries and totals without calculating them.
  void client.invalidateQueries({ queryKey: nightKeys.lists(owner) })
  void client.invalidateQueries({ queryKey: nightKeys.inbox(owner) })
  void client.invalidateQueries({ queryKey: eventKey, predicate: query => queryKind(query.queryKey) === 'votes' })
}
export async function guardedRequest<T>(client: QueryClient, owner: number, id: number | undefined, run: (context: RequestContext) => Promise<T>, signal?: AbortSignal, scope: RequestScope = 'write') {
  const context = requestContext(client, owner, id, signal, scope)
  if (!context.isCurrent()) throw new MovieNightRequestCancelled()
  try {
    const result = await run(context)
    if (!context.isCurrent()) throw new MovieNightRequestCancelled()
    return result
  } catch (error) {
    if (context.isCurrent()) {
      const { status } = movieNightError(error)
      if (status === 401 || status === 403 || status === 404) {
        purgeNight(client, owner, status === 401 ? undefined : id)
        if (status === 401 || status === 403) void client.invalidateQueries({ queryKey: authKey })
      }
    }
    throw error
  }
}
