import type { MovieSummary } from '../../movies/types/movie.types'

// Distinct brands prevent accidentally voting with a TMDB movie identifier.
declare const candidateId: unique symbol
declare const tmdbId: unique symbol
export type CandidateId = number & { readonly [candidateId]: true }
export type TmdbId = number & { readonly [tmdbId]: true }
export function asCandidateId(id: number): CandidateId {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError('Invalid Core candidate ID.')
  return id as CandidateId
}
export function asTmdbId(id: number): TmdbId {
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new RangeError('Invalid TMDB ID.')
  return id as TmdbId
}
export type NightStatus = 'scheduled' | 'cancelled' | 'finalized'
export type Rsvp = 'pending' | 'accepted' | 'declined'
export interface Participant { id: number; username: string; avatar_url: string | null }
interface SummaryBase {
  id: number; title: string; host: Participant; starts_at: string; timezone: string; status: NightStatus
}
export interface MinimalNightSummary extends SummaryBase { my_rsvp: 'pending' | 'declined' }
export interface AcceptedNightSummary extends SummaryBase {
  my_rsvp: 'accepted'; finalized_tmdb_id: TmdbId | null; finalized_at: string | null
  cancelled_at: string | null; voting_open: boolean; created_at: string; updated_at: string
}
export type NightSummary = MinimalNightSummary | AcceptedNightSummary
export interface MovieNight extends AcceptedNightSummary { location: string | null; meeting_url: string | null }
export interface Invitation { id: number; participant: Participant; rsvp_status: Rsvp; responded_at: string | null }
export interface ReceivedInvitation extends Invitation { movie_night: NightSummary }
export interface Candidate { id: CandidateId; tmdb_id: TmdbId; nominated_by: Participant; created_at: string; movie: MovieSummary | null }
export interface Vote { movie_night_movie_id: CandidateId; updated_at: string }
export interface VoteTotals {
  totals: { tmdb_id: TmdbId; movie_night_movie_id: CandidateId; votes: number }[]
  my_vote: CandidateId | null; total_votes: number; leaders: TmdbId[]; voting_open: boolean
}
export interface Pagination { page?: number; per_page?: number }
export interface NightFilters extends Pagination { status?: NightStatus }
export interface Page<T> { data: T[]; meta: { page: number; per_page: number; total_pages: number; total_results: number } }
export interface ShortlistPage extends Page<Candidate> { meta: Page<Candidate>['meta'] & { metadata_unavailable: boolean } }
export interface EventFields { title: string; starts_at: string; timezone: string; location?: string | null; meeting_url?: string | null }
