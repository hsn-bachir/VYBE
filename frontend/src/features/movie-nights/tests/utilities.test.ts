import { expect, it } from 'vitest'
import { localToUtc, resolveLocalTime, schedulePreview, suggestedTimezone, utcToLocal, validTimezone } from '../lib/dateTime'
import { canRemoveCandidate, nightPermissions, nightRelationship } from '../lib/permissions'
import { asCandidateId, asTmdbId, type Candidate, type MovieNight, type VoteTotals } from '../types/movieNight.types'
import type { Access } from '../../auth/hooks/useAccess'
const host = { id: 7, username: 'host', email: 'host@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
const active: Access = { role: 'user', account_status: 'active' }
const night: MovieNight = { id: 12, title: 'Fixture', host, starts_at: '2027-07-16T18:00:00Z', timezone: 'Asia/Beirut', status: 'scheduled', my_rsvp: 'accepted', finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, voting_open: true, created_at: '', updated_at: '', location: null, meeting_url: null }
const start = Date.parse(night.starts_at)
const candidate: Candidate = { id: asCandidateId(42), tmdb_id: asTmdbId(550), nominated_by: { ...host, id: 8 }, created_at: '', movie: null }
const votes: VoteTotals = { totals: [{ movie_night_movie_id: candidate.id, tmdb_id: candidate.tmdb_id, votes: 0 }], my_vote: null, total_votes: 0, leaders: [], voting_open: true }
it.each([
  ['2027-07-16T21:00', 'Asia/Beirut', '2027-07-16T18:00:00Z'],
  ['2027-01-16T21:00', 'Asia/Beirut', '2027-01-16T19:00:00Z'],
  ['2027-07-16T21:00:15', 'Asia/Kathmandu', '2027-07-16T15:15:15Z'],
  ['2027-07-16T21:00', 'UTC', '2027-07-16T21:00:00Z'],
])('serializes %s in %s to exact backend UTC seconds', (local, timezone, utc) => {
  expect(localToUtc(local, timezone)).toBe(utc)
  expect(utcToLocal(utc, timezone)).toBe(local.length === 16 ? `${local}:00` : local)
})
it.each([
  ['2027-03-14T02:30', 'America/New_York'],
  ['2027-03-28T02:30', 'Europe/Berlin'],
  ['2027-10-03T02:15', 'Australia/Lord_Howe'],
  ['2011-12-30T12:00', 'Pacific/Apia'],
])('rejects nonexistent local time %s in %s', (local, timezone) => {
  expect(resolveLocalTime(local, timezone)).toEqual({ kind: 'gap', instants: [] })
  expect(() => localToUtc(local, timezone)).toThrow('does not exist')
})
it.each([
  ['2027-11-07T01:30', 'America/New_York', '2027-11-07T05:30:00Z', '2027-11-07T06:30:00Z'],
  ['2027-10-31T02:30', 'Europe/Berlin', '2027-10-31T00:30:00Z', '2027-10-31T01:30:00Z'],
  ['2027-04-04T01:45', 'Australia/Lord_Howe', '2027-04-03T14:45:00Z', '2027-04-03T15:15:00Z'],
])('requires an explicit choice for ambiguous %s in %s', (local, timezone, earlier, later) => {
  expect(resolveLocalTime(local, timezone)).toEqual({ kind: 'overlap', instants: [earlier, later] })
  expect(() => localToUtc(local, timezone)).toThrow('occurs twice')
  expect(localToUtc(local, timezone, 'earlier')).toBe(earlier)
  expect(localToUtc(local, timezone, 'later')).toBe(later)
})
it.each(['2027-02-29T10:00', '2027-04-31T10:00', '2027-07-16T24:00', '2027-07-16T10:60', '2027-07-16', '2027-07-16T10:00Z'])('rejects invalid or implicit local date %s', local => {
  expect(() => localToUtc(local, 'UTC')).toThrow()
})
it('keeps browser zone as a suggestion, requires explicit valid zone and previews the event zone', () => {
  expect(validTimezone(suggestedTimezone())).toBe(true)
  expect(validTimezone('Mars/Cinema')).toBe(false); expect(validTimezone('')).toBe(false)
  expect(() => localToUtc('2027-07-16T21:00', 'Mars/Cinema')).toThrow('IANA')
  expect(schedulePreview(night.starts_at, night.timezone)).toContain('Asia/Beirut')
  expect(() => utcToLocal('2027-07-16T21:00:00+03:00', night.timezone)).toThrow('UTC')
})
it('allows eligible host actions before the start, with implicit acceptance and no role bypass', () => {
  const permission = nightPermissions(host, active, night, start - 1)
  for (const key of ['privateRead', 'roster', 'edit', 'invite', 'cancel', 'finalize', 'vote', 'nominate'] as const) expect(permission[key]).toBe(true)
  expect(permission.rsvp).toBe(false)
  expect(nightRelationship(night, 7)).toBe('host')
})
it.each([0, 1])('closes deadline actions at start plus %s ms but retains host cancel/finalize', offset => {
  const permission = nightPermissions(host, active, night, start + offset)
  expect(permission.vote).toBe(false); expect(permission.nominate).toBe(false); expect(permission.edit).toBe(false); expect(permission.invite).toBe(false)
  expect(permission.finalize).toBe(true); expect(permission.cancel).toBe(true)
})
it.each(['cancelled', 'finalized'] as const)('keeps %s private reads but closes every event mutation', status => {
  const permission = nightPermissions(host, active, { ...night, status, voting_open: false }, start - 1)
  expect(permission.privateRead).toBe(true)
  for (const key of ['edit', 'invite', 'cancel', 'finalize', 'rsvp', 'nominate', 'vote'] as const) expect(permission[key]).toBe(false)
})
it.each(['pending', 'declined'] as const)('limits %s invitees to minimal summaries and RSVP', my_rsvp => {
  const minimal = { id: night.id, title: night.title, host: night.host, starts_at: night.starts_at, timezone: night.timezone, status: night.status, my_rsvp }
  const permission = nightPermissions({ ...host, id: 8 }, active, minimal, start - 1)
  expect(permission.privateRead).toBe(false); expect(permission.vote).toBe(false); expect(permission.rsvp).toBe(true)
  expect(nightRelationship(minimal, 8)).toBe(my_rsvp)
})
it('accepted invitees can contribute but cannot manage, and server voting_open overrides local clock', () => {
  const user = { ...host, id: 8 }
  const permission = nightPermissions(user, active, night, start - 1)
  expect(permission.vote).toBe(true); expect(permission.finalize).toBe(false); expect(permission.roster).toBe(false)
  expect(permission.edit).toBe(false); expect(permission.rsvp).toBe(true)
  expect(nightPermissions(user, active, { ...night, voting_open: false }, start - 1).vote).toBe(false)
})
it.each(['restricted', 'banned', 'deactivated'] as const)('respects account state %s', account_status => {
  const permission = nightPermissions(host, { ...active, account_status }, night, start - 1)
  expect(permission.privateRead).toBe(account_status === 'restricted')
  expect(permission.vote).toBe(false); expect(permission.finalize).toBe(false); expect(permission.create).toBe(false)
})
it('fails closed for guest, unknown account access and unverified sessions', () => {
  expect(nightPermissions(null, active, night).privateRead).toBe(false)
  expect(nightPermissions(host, undefined, night).create).toBe(false)
  expect(nightPermissions({ ...host, email_verified_at: null }, active, night).privateRead).toBe(false)
})
it('requires authoritative zero votes and ownership to offer candidate removal', () => {
  expect(canRemoveCandidate(host, active, night, candidate, votes, start - 1)).toBe(true)
  expect(canRemoveCandidate({ ...host, id: 8 }, active, night, candidate, votes, start - 1)).toBe(true)
  expect(canRemoveCandidate({ ...host, id: 9 }, active, night, candidate, votes, start - 1)).toBe(false)
  expect(canRemoveCandidate(host, active, night, candidate, undefined, start - 1)).toBe(false)
  expect(canRemoveCandidate(host, active, night, candidate, { ...votes, totals: [{ ...votes.totals[0], votes: 1 }] }, start - 1)).toBe(false)
})
