import { api } from '../../../lib/api/client'
import { MovieNightRequestCancelled } from './errors'
import type { Candidate, CandidateId, EventFields, Invitation, MovieNight, NightFilters, NightSummary, Page, Pagination, Participant, ReceivedInvitation, ShortlistPage, TmdbId, Vote, VoteTotals } from '../types/movieNight.types'

const base = '/api/v1/me/movie-nights'
// Mandatory guard is supplied by the owner-scoped query/mutation layer, including after CSRF.
export interface RequestContext { isCurrent: () => boolean; signal?: AbortSignal }
function check(context: RequestContext) {
  if (context.signal?.aborted || !context.isCurrent()) throw new MovieNightRequestCancelled()
}
async function read<T>(path: string, params: object | undefined, context: RequestContext): Promise<T> {
  check(context)
  const response = await api.get<T>(path, { ...(params ? { params } : {}), signal: context.signal })
  check(context)
  return response.data
}
async function write<T>(method: 'post' | 'patch' | 'put' | 'delete', path: string, body: object | undefined, context: RequestContext): Promise<T> {
  check(context)
  await api.get('/sanctum/csrf-cookie', { signal: context.signal })
  check(context)
  const config = { signal: context.signal }
  const response = method === 'delete' ? await api.delete<T>(path, config) : await api[method]<T>(path, body, config)
  check(context)
  return response.data
}
const page = (p: Pagination) => ({ page: p.page ?? 1, per_page: p.per_page ?? 20 })
export const movieNightApi = {
  list: (p: NightFilters, c: RequestContext) => read<Page<NightSummary>>(base, { ...page(p), ...(p.status ? { status: p.status } : {}) }, c),
  create: async (fields: EventFields, c: RequestContext) => (await write<{ data: MovieNight }>('post', base, fields, c)).data,
  detail: async (id: number, c: RequestContext) => (await read<{ data: MovieNight }>(`${base}/${id}`, undefined, c)).data,
  update: async (id: number, fields: Partial<EventFields>, c: RequestContext) => (await write<{ data: MovieNight }>('patch', `${base}/${id}`, fields, c)).data,
  cancel: async (id: number, c: RequestContext) => (await write<{ data: MovieNight }>('post', `${base}/${id}/cancel`, {}, c)).data,
  eligibleUsers: (id: number, query: string, p: Pagination, c: RequestContext) => read<Page<Participant>>(`${base}/${id}/eligible-users`, { ...page(p), query: query.trim().toLowerCase() }, c),
  invite: async (id: number, invited_user_id: number, c: RequestContext) => (await write<{ data: Invitation }>('post', `${base}/${id}/invitations`, { invited_user_id }, c)).data,
  roster: (id: number, p: Pagination, c: RequestContext) => read<Page<Invitation>>(`${base}/${id}/invitations`, page(p), c),
  received: (p: Pagination, c: RequestContext) => read<Page<ReceivedInvitation>>(`${base}/invitations`, page(p), c),
  rsvp: async (id: number, rsvp_status: 'accepted' | 'declined', c: RequestContext) => (await write<{ data: Invitation }>('put', `${base}/${id}/rsvp`, { rsvp_status }, c)).data,
  shortlist: (id: number, p: Pagination, c: RequestContext) => read<ShortlistPage>(`${base}/${id}/movies`, page(p), c),
  nominate: async (id: number, tmdb_id: TmdbId, c: RequestContext) => (await write<{ data: Candidate }>('post', `${base}/${id}/movies`, { tmdb_id }, c)).data,
  remove: async (id: number, candidate: CandidateId, c: RequestContext) => { await write<void>('delete', `${base}/${id}/movies/${candidate}`, undefined, c) },
  vote: async (id: number, movie_night_movie_id: CandidateId, c: RequestContext) => (await write<{ data: Vote }>('put', `${base}/${id}/vote`, { movie_night_movie_id }, c)).data,
  votes: async (id: number, c: RequestContext) => (await read<{ data: VoteTotals }>(`${base}/${id}/votes`, undefined, c)).data,
  finalize: async (id: number, tmdb_id: TmdbId | undefined, c: RequestContext) => (await write<{ data: MovieNight }>('post', `${base}/${id}/finalize`, tmdb_id === undefined ? {} : { tmdb_id }, c)).data,
}
