import axios from 'axios'
import { errorDetails } from '../../../lib/api/client'
import { asTmdbId, type TmdbId } from '../types/movieNight.types'

export class MovieNightRequestCancelled extends Error {
  constructor() { super('The account or event access changed. Refresh before trying again.'); this.name = 'MovieNightRequestCancelled' }
}
export function movieNightError(error: unknown) {
  const response = axios.isAxiosError(error) ? error.response : undefined
  const status = response?.status
  const data = response?.data
  const tie = status === 409 && data?.code === 'MOVIE_NIGHT_TIE'
  const leaders: TmdbId[] = tie && Array.isArray(data.leaders)
    ? data.leaders.filter((id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647).map(asTmdbId) : []
  const fields = errorDetails(error).fields
  return {
    status, code: tie ? 'MOVIE_NIGHT_TIE' as const : undefined, leaders, fields,
    staleSelection: status === 422 && Array.isArray(fields.tmdb_id),
    refresh: status === 409 || (status === 422 && Array.isArray(fields.tmdb_id)),
    retryAfter: response?.headers?.['retry-after'] as string | undefined,
    message: error instanceof MovieNightRequestCancelled ? error.message
      : tie ? 'Choose one of the current tied leaders.'
      : status === 401 ? 'Sign in again to access Movie Nights.'
      : status === 404 ? 'This movie night or candidate is unavailable.'
      : status === 409 ? 'The movie night changed or this action is no longer available. Refresh and try again.'
      : errorDetails(error).message,
  }
}
