import type { User } from '../../auth/types/auth.types'
import type { Access } from '../../auth/hooks/useAccess'
import type { Candidate, NightSummary, VoteTotals } from '../types/movieNight.types'

// Display hints only: the server rechecks membership/account/lifecycle under locks.
export function nightPermissions(user: User | null | undefined, access: Access | undefined, night?: NightSummary, now = Date.now()) {
  const read = !!user?.email_verified_at && !!access && ['active', 'restricted'].includes(access.account_status)
  const write = read && access?.account_status === 'active'
  const host = !!night && user?.id === night.host.id
  const accepted = !!night && (host || night.my_rsvp === 'accepted')
  const scheduled = night?.status === 'scheduled'
  const beforeStart = !!night && now < Date.parse(night.starts_at)
  const open = scheduled && beforeStart && night?.my_rsvp === 'accepted' && night.voting_open
  return {
    read, create: write, privateRead: read && accepted,
    roster: read && host, edit: write && host && open, invite: write && host && open,
    cancel: write && host && scheduled, finalize: write && host && scheduled,
    rsvp: write && !!night && !host && scheduled && beforeStart,
    nominate: write && accepted && open, vote: write && accepted && open,
  }
}
export function canRemoveCandidate(user: User | null | undefined, access: Access | undefined, night: NightSummary, candidate: Candidate, votes: VoteTotals | undefined, now = Date.now()) {
  const permission = nightPermissions(user, access, night, now)
  const total = votes?.totals.find(row => row.movie_night_movie_id === candidate.id)
  return permission.nominate && (user?.id === night.host.id || user?.id === candidate.nominated_by.id)
    && votes?.voting_open === true && total?.votes === 0
}
export function nightRelationship(night: NightSummary, owner: number): 'host' | 'accepted' | 'pending' | 'declined' {
  return night.host.id === owner ? 'host' : night.my_rsvp
}
