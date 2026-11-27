import { renderToStaticMarkup, renderToReadableStream } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '../../../App'
import { api } from '../../../lib/api/client'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey } from '../../auth/hooks/useAccess'
import { MovieNightForm } from '../components/MovieNightForm'
import { CancelMovieNightDialog } from '../components/MovieNightManagement'
import { nightOptions, nightMutationOptions } from '../hooks/useMovieNights'
import { applyNightUpdate, nightAccessVersion, purgeNight, requestContext, subscribeNightAccess } from '../hooks/cache'
import { eventFormPayload, eventFormValues, formSchedule, nightRouteId, safeMeetingUrl } from '../lib/eventForm'
import type { MovieNight } from '../types/movieNight.types'

const user = { id: 7, username: 'host', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
const night: MovieNight = { id: 12, title: 'Private screening', host: user, starts_at: '2027-07-16T18:00:00.000000Z', timezone: 'Asia/Beirut', location: 'Private hall', meeting_url: 'https://example.test/room', status: 'scheduled', my_rsvp: 'accepted', finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, voting_open: true, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }
const before = Date.parse('2027-01-01T00:00:00Z')
function setup(owner = 7, status = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } })
  client.setQueryData(authKey, { ...user, id: owner })
  client.setQueryData(accessKey(owner), { role: 'user', account_status: status })
  return client
}
function details(client: QueryClient) { return { ...nightOptions(client, client.getQueryData<typeof user>(authKey)!.id, { kind: 'detail', id: 12 }), gcTime: Infinity } }
function render(node: React.ReactNode, client = setup()) { return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>) }
async function route(client: QueryClient, path: string) {
  const stream = await renderToReadableStream(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
  await stream.allReady
  return new Response(stream).text()
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => vi.restoreAllMocks())

it('converts stored UTC to editable local values and serializes exact Core creation fields', () => {
  const values = eventFormValues(night)
  expect(values.date).toBe('2027-07-16'); expect(values.time).toBe('21:00:00')
  expect(eventFormPayload(values, undefined, before)).toEqual({ errors: {}, fields: { title: night.title, starts_at: '2027-07-16T18:00:00Z', timezone: night.timezone, location: night.location, meeting_url: night.meeting_url } })
})
it('keeps wall time unchanged when timezone changes, changing only the interpreted instant', () => {
  const values = eventFormValues(night), changed = { ...values, timezone: 'America/New_York' }
  expect(changed.date).toBe(values.date); expect(changed.time).toBe(values.time)
  expect(formSchedule(changed)).toBe('2027-07-17T01:00:00Z')
})
it('rejects DST gaps and requires a choice for overlaps without shifting entered wall time', () => {
  const values = { ...eventFormValues(night), date: '2027-03-14', time: '02:30', timezone: 'America/New_York' }
  expect(eventFormPayload(values, undefined, before).errors.starts_at).toContain('does not exist')
  const overlap = { ...values, date: '2027-11-07', time: '01:30' }
  expect(eventFormPayload(overlap, undefined, before).errors.starts_at).toContain('occurs twice')
  expect(formSchedule({ ...overlap, occurrence: 'earlier' })).toBe('2027-11-07T05:30:00Z')
  expect(formSchedule({ ...overlap, occurrence: 'later' })).toBe('2027-11-07T06:30:00Z')
})
it.each(['2027-11-07T05:30:00Z', '2027-11-07T06:30:00Z'])('preserves an authoritative repeated-time instant %s when editing', starts_at => {
  const values = eventFormValues({ ...night, starts_at, timezone: 'America/New_York' })
  expect(formSchedule(values)).toBe(starts_at)
  expect(values.occurrence).toBe(starts_at.includes('05:') ? 'earlier' : 'later')
})
it.each([0, -1])('rejects scheduled time at now plus %s ms', offset => {
  const values = eventFormValues(night), instant = Date.parse(formSchedule(values))
  expect(eventFormPayload(values, undefined, instant - offset).errors.starts_at).toContain('future')
})
it.each([
  ['title', ' ', 'title'], ['title', 'x'.repeat(151), 'title'], ['location', 'x'.repeat(501), 'location'],
  ['meeting_url', 'http://example.test', 'meeting_url'], ['meeting_url', 'javascript:alert(1)', 'meeting_url'],
  ['meeting_url', `https://example.test/${'x'.repeat(2048)}`, 'meeting_url'], ['timezone', 'Unknown/Zone', 'starts_at'],
] as const)('validates %s against the existing contract', (key, value, error) => {
  const result = eventFormPayload({ ...eventFormValues(night), [key]: value }, undefined, before)
  expect(result.fields).toBeUndefined(); expect(result.errors[error]).toBeTruthy()
})
it('matches Laravel Unicode length limits and allows all valid optional-field lengths', () => {
  const values = { ...eventFormValues(night), title: '🎬'.repeat(150), location: '🎬'.repeat(500) }
  expect(eventFormPayload(values, undefined, before).errors).toEqual({})
  expect(eventFormPayload({ ...values, title: values.title + '🎬' }, undefined, before).errors.title).toBeTruthy()
})
it('sends only changed PATCH fields and explicitly clears optional fields with null', () => {
  const initial = eventFormValues(night)
  expect(eventFormPayload({ ...initial, location: '  ', meeting_url: '' }, initial, before).fields).toEqual({ location: null, meeting_url: null })
  expect(eventFormPayload({ ...initial, title: 'Updated' }, initial, before).fields).toEqual({ title: 'Updated' })
  expect(eventFormPayload(initial, initial, before).errors.form).toContain('at least one')
})
it.each([undefined, '', '0', '-1', '01', '1.5', '1e3', '9007199254740992', 'abc'])('rejects unrepresentable or noncanonical route ID %s', value => {
  expect(nightRouteId(value)).toBeUndefined()
})
it('accepts canonical safe SQL IDs and rejects unsafe meeting link protocols', () => {
  expect(nightRouteId('12')).toBe(12)
  expect(nightRouteId(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  expect(safeMeetingUrl('https://example.test')).toBe('https://example.test')
  for (const value of ['http://example.test', 'javascript:alert(1)', '//example.test', null]) expect(safeMeetingUrl(value)).toBeUndefined()
})
it('renders the reusable form with search, privacy hints and no conflicting UTF-16 maxlength limits', () => {
  const html = render(<MovieNightForm night={night} onSave={async () => {}} onCancel={() => {}} />)
  for (const label of ['Event title', 'Scheduled date', 'Scheduled time', 'Timezone', 'Physical location', 'Meeting URL', 'Schedule preview', 'Save changes']) expect(html).toContain(label)
  expect(html).toContain('<datalist'); expect(html).toContain('21:00:00'); expect(html).not.toContain('maxLength=')
})
it('disables all form inputs while a submission is pending', () => {
  const html = render(<MovieNightForm busy onSave={async () => {}} onCancel={() => {}} />)
  expect(html).toContain('<fieldset disabled=""'); expect(html).toContain('Saving…')
})
it.each([['active', true], ['restricted', false], ['banned', false], ['deactivated', false]] as const)('enforces direct creation permission for %s accounts', async (status, allowed) => {
  const html = await route(setup(7, status), '/movie-nights/new')
  expect(html.includes('night-event-form')).toBe(allowed)
  if (!allowed) expect(html).toContain('Creation is unavailable')
})
it.each([['scheduled', 7, true], ['scheduled', 8, false], ['cancelled', 7, false], ['finalized', 7, false]] as const)('renders %s detail for owner %s with management permission %s', async (status, owner, manage) => {
  const client = setup(owner)
  client.setQueryData(details(client).queryKey, { ...night, status })
  const html = await route(client, '/movie-nights/12')
  expect(html).toContain('Private hall'); expect(html).toContain('example.test/room')
  expect(html.includes('Edit movie night')).toBe(manage)
  expect(html.includes('Cancel movie night')).toBe(manage)
  for (const section of ['Participants', 'Shared shortlist', 'Voting']) expect(html).toContain(section)
  expect(html).not.toContain('Finalize movie night')
})
it('allows restricted authorized detail reads without actions', async () => {
  const client = setup(7, 'restricted'); client.setQueryData(details(client).queryKey, night)
  const html = await route(client, '/movie-nights/12')
  expect(html).toContain('Private hall'); expect(html).not.toContain('Edit movie night'); expect(html).not.toContain('Cancel movie night')
})
it.each(['0', '01', 'abc', '9007199254740992'])('does not request details for invalid route %s', async id => {
  const get = vi.spyOn(api, 'get')
  const html = await route(setup(), `/movie-nights/${id}`)
  expect(html).toContain('Movie night unavailable'); expect(get).not.toHaveBeenCalled()
})
it('refuses malformed nonaccepted private resources rather than rendering their location', async () => {
  const client = setup(); client.setQueryData([...details(client).queryKey], { ...night, my_rsvp: 'declined' })
  const html = await route(client, '/movie-nights/12')
  expect(html).toContain('Movie night unavailable'); expect(html).not.toContain('Private hall')
})
it('requires irreversible cancellation confirmation and offers a safe default action', () => {
  const html = render(<CancelMovieNightDialog id={12} onClose={() => {}} />)
  expect(html).toContain('Cancellation is irreversible'); expect(html).toContain('Keep movie night'); expect(html).toContain('autofocus=""')
  expect(html).not.toContain('Finalize')
})
it('applies the authoritative edit response immediately and rejects an older uncancellable detail response', async () => {
  const client = setup(), options = details(client)
  client.setQueryData(options.queryKey, night)
  const old = deferred<{ data: { data: MovieNight } }>()
  vi.spyOn(api, 'get').mockImplementation(path => String(path).endsWith('/12') ? old.promise : Promise.resolve({}))
  const updated = { ...night, title: 'Server updated title', updated_at: '2026-11-02T00:00:00Z' }
  vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: updated } })
  const stale = client.fetchQuery(options).catch(error => error)
  await nightMutationOptions(client, 7).mutationFn({ kind: 'update', id: 12, fields: { title: 'Server updated title' } })
  expect(client.getQueryData(options.queryKey)).toEqual(updated)
  old.resolve({ data: { data: night } }); await stale
  expect(client.getQueryData(options.queryKey)).toEqual(updated)
})
it('never restores scheduled state over a terminal response or an older edit over a newer timestamp', () => {
  const client = setup(), options = details(client)
  client.setQueryData(options.queryKey, { ...night, status: 'cancelled', voting_open: false })
  applyNightUpdate(client, 7, 12, night)
  expect(client.getQueryData(options.queryKey)?.status).toBe('cancelled')
  const newer = { ...night, title: 'Newer', updated_at: '2026-11-03T00:00:00Z' }
  client.setQueryData(options.queryKey, newer)
  applyNightUpdate(client, 7, 12, night)
  expect(client.getQueryData(options.queryKey)).toEqual(newer)
})
it.each(['event', 'account', 'switch'] as const)('notifies mounted sensitive-form boundaries after %s revocation', action => {
  const client = setup(), listener = vi.fn()
  const context = requestContext(client, 7, 12), version = nightAccessVersion(client, 7, 12)
  const stop = subscribeNightAccess(client, listener)
  if (action === 'event') purgeNight(client, 7, 12)
  else if (action === 'account') purgeNight(client, 7)
  else client.setQueryData(authKey, { ...user, id: 8 })
  expect(listener).toHaveBeenCalled(); expect(context.isCurrent()).toBe(false)
  expect(nightAccessVersion(client, 7, 12)).not.toBe(version)
  stop()
})
it('unrelated event revocation does not reset creation or another event form boundary', () => {
  const client = setup(), create = requestContext(client, 7), other = requestContext(client, 7, 13)
  const createVersion = nightAccessVersion(client, 7), otherVersion = nightAccessVersion(client, 7, 13)
  purgeNight(client, 7, 12)
  expect(create.isCurrent()).toBe(true); expect(other.isCurrent()).toBe(true)
  expect(nightAccessVersion(client, 7)).toBe(createVersion); expect(nightAccessVersion(client, 7, 13)).toBe(otherVersion)
})
it('retains a usable detail page when runtime timezone data is unavailable and does not open an unsafe edit', async () => {
  const client = setup(); client.setQueryData(details(client).queryKey, { ...night, timezone: 'Unknown/Zone' })
  const html = await route(client, '/movie-nights/12')
  expect(html).toContain('Schedule unavailable'); expect(html).toContain('Private hall')
  expect(html).not.toContain('Edit movie night'); expect(html).toContain('Cancel movie night')
})
it('immediately applies authoritative cancellation even when the scheduled cache has a later timestamp', () => {
  const client = setup(), options = details(client)
  client.setQueryData(options.queryKey, { ...night, updated_at: '2030-01-01T00:00:00Z' })
  const cancelled: MovieNight = { ...night, status: 'cancelled', voting_open: false }
  applyNightUpdate(client, 7, 12, cancelled)
  expect(client.getQueryData(options.queryKey)).toEqual(cancelled)
})
