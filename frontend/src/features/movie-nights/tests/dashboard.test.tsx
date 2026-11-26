import { renderToStaticMarkup, renderToReadableStream } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../../../App'
import { MovieNavigation } from '../../../components/navigation/MovieNavigation'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { authKey } from '../../auth/hooks/useAuth'
import { accessKey, type Access } from '../../auth/hooks/useAccess'
import { api } from '../../../lib/api/client'
import MovieNightsPage from '../pages/MovieNightsPage'
import { MovieNightCard } from '../components/MovieNightCard'
import { nightOptions } from '../hooks/useMovieNights'
import { dashboardState, dashboardTarget } from '../lib/dashboardState'
import type { NightSummary, Page, ReceivedInvitation } from '../types/movieNight.types'

const user = { id: 7, username: 'fixture', email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' }
const night: NightSummary = { id: 12, title: 'A little cinema', host: { id: 8, username: 'organizer', avatar_url: null }, starts_at: '2027-07-16T18:00:00.000000Z', timezone: 'Asia/Beirut', status: 'scheduled', my_rsvp: 'pending' }
const meta = { page: 1, per_page: 12, total_pages: 3, total_results: 25 }
function setup(status: Access['account_status'] = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } })
  client.setQueryData(authKey, user)
  client.setQueryData(accessKey(7), { role: 'user', account_status: status })
  return client
}
function seed(client: QueryClient, url = '/movie-nights', data: NightSummary[] = [night]) {
  const state = dashboardState(new URL(url, 'https://fixture.test').searchParams)
  const options = nightOptions(client, 7, { kind: 'list', filters: { page: state.page, per_page: 12, ...(state.status === 'all' ? {} : { status: state.status }) } })
  client.setQueryData(options.queryKey, { data, meta })
}
function render(client = setup(), url = '/movie-nights', node = <MovieNightsPage />) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{node}</MemoryRouter></QueryClientProvider>)
}
async function renderApp(client: QueryClient, path: string) {
  const stream = await renderToReadableStream(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
  await stream.allReady
  return new Response(stream).text()
}
it.each(['/movie-nights', '/movie-nights/new', '/movie-nights/12'])('highlights Movie Nights after Library on %s', path => {
  const html = render(setup(), path, <MovieNavigation showLibrary />)
  expect(html).toContain('aria-current="page" href="/movie-nights"')
  expect(html.indexOf('>Library</a>')).toBeLessThan(html.indexOf('>Movie Nights</a>'))
})
it('preserves guest navigation and avoids matching similar route names', () => {
  expect(render(setup(), '/', <MovieNavigation />)).not.toContain('>Movie Nights</a>')
  expect(render(setup(), '/movie-nights-other', <MovieNavigation showLibrary />)).not.toContain('aria-current="page" href="/movie-nights"')
})
it.each(['/movie-nights', '/movie-nights/new', '/movie-nights/12'])('renders protected lazy route %s for verified sessions', async path => {
  const client = setup(); seed(client)
  client.setQueryData(nightOptions(client, 7, { kind: 'detail', id: 12 }).queryKey, { ...night, my_rsvp: 'accepted', location: null, meeting_url: null, finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, voting_open: true, created_at: '', updated_at: '' })
  const html = await renderApp(client, path)
  expect(html).toContain(path.endsWith('new') ? 'Create a movie night' : 'A little cinema')
  expect(html).toContain('Movie Nights</a>')
})
it.each(['/movie-nights', '/movie-nights/new', '/movie-nights/12'])('withholds %s from guests and unverified sessions', async path => {
  const client = setup(); seed(client)
  client.setQueryData(authKey, null)
  expect(await renderApp(client, path)).not.toContain('movie-nights-page')
  client.setQueryData(authKey, { ...user, email_verified_at: null })
  expect(await renderApp(client, path)).not.toContain('movie-nights-page')
})
it('renders server summaries, creation action and semantic status filters without inferred counts', () => {
  const client = setup(); seed(client)
  const html = render(client)
  for (const text of ['Create Movie Night', 'My Movie Nights', 'Invitations', 'All', 'Scheduled', 'Finalized', 'Cancelled', 'A little cinema', '@organizer', '21:00', 'Asia/Beirut', 'Invited']) expect(html).toContain(text)
  expect(html).not.toContain('25 movie nights')
  expect(html).not.toContain('Hosting (')
})
it.each(['host', 'accepted', 'pending', 'declined'] as const)('labels %s relationships and only links eligible private summaries', relationship => {
  const summary = { ...night, host: { ...night.host, id: relationship === 'host' ? 7 : 8 }, my_rsvp: relationship === 'host' ? 'accepted' : relationship } as NightSummary
  const html = render(setup(), '/movie-nights', <ul><MovieNightCard night={summary} owner={7} /></ul>)
  expect(html).toContain({ host: 'Hosting', accepted: 'Going', pending: 'Invited', declined: 'Declined' }[relationship])
  expect(html.includes('href="/movie-nights/12"')).toBe(['host', 'accepted'].includes(relationship))
})
it.each(['pending', 'declined'] as const)('never renders private fields or links for %s invitation data', rsvp => {
  const client = setup()
  const summary = { ...night, my_rsvp: rsvp, location: 'PRIVATE LOCATION', meeting_url: 'https://secret.test', finalized_tmdb_id: 550 } as NightSummary
  const data: Page<ReceivedInvitation> = { data: [{ id: 1, participant: night.host, rsvp_status: rsvp, responded_at: null, movie_night: summary }], meta }
  client.setQueryData(nightOptions(client, 7, { kind: 'received', page: { page: 2, per_page: 12 } }).queryKey, data)
  const get = vi.spyOn(api, 'get')
  try {
    const html = render(client, '/movie-nights?view=invitations&page=2&status=scheduled')
    expect(html).toContain('RSVP:'); expect(html).toContain(rsvp === 'pending' ? 'Pending' : 'Declined')
    expect(html).toContain('across all event and RSVP statuses')
    expect(html).not.toContain('Event status')
    expect(html).not.toContain('PRIVATE LOCATION'); expect(html).not.toContain('secret.test'); expect(html).not.toContain('550')
    expect(html).not.toContain('href="/movie-nights/12"')
    expect(get).not.toHaveBeenCalled()
  } finally { get.mockRestore() }
})
it('keeps restricted verified account reads and removes creation action', () => {
  const client = setup('restricted'); seed(client)
  const html = render(client)
  expect(html).toContain('A little cinema'); expect(html).toContain('account is restricted')
  expect(html).not.toContain('href="/movie-nights/new"')
})
it.each(['banned', 'deactivated'] as const)('withholds cached summary rendering from %s accounts', status => {
  const client = setup(status); seed(client)
  const html = render(client)
  expect(html).toContain('Movie Nights is unavailable'); expect(html).not.toContain('A little cinema')
})
it('uses honest loading, empty, filtered-empty and out-of-range states', () => {
  const client = setup()
  expect(render(client)).toContain('Loading movie nights')
  seed(client, '/movie-nights', [])
  expect(render(client)).toContain('Your next movie night starts here')
  seed(client, '/movie-nights?status=cancelled', [])
  expect(render(client, '/movie-nights?status=cancelled')).toContain('No movie nights with this status')
  seed(client, '/movie-nights?page=9', [])
  expect(render(client, '/movie-nights?page=9')).toContain('No movie nights on this page')
})
it('renders retry for an API outage without displaying server diagnostics or old cards', async () => {
  const client = setup()
  const options = nightOptions(client, 7, { kind: 'list', filters: { page: 1, per_page: 12 } })
  const get = vi.spyOn(api, 'get').mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { message: 'SQL diagnostic secret' } } })
  try { await client.fetchQuery(options).catch(() => {}) } finally { get.mockRestore() }
  const html = render(client)
  expect(html).toContain('Try again'); expect(html).not.toContain('SQL diagnostic secret')
})
it('preserves current view/status/page in shared server pagination links', () => {
  const html = render(setup(), '/movie-nights?view=nights&status=finalized&page=2', <MoviePagination page={2} totalPages={4} />)
  expect(html).toContain('/movie-nights?view=nights&amp;status=finalized&amp;page=3')
  expect(html).toContain('/movie-nights?view=nights&amp;status=finalized')
  expect(dashboardTarget(new URLSearchParams('view=invitations&page=3&status=scheduled'), { view: 'nights' })).toBe('/movie-nights?view=nights&status=scheduled')
})
it.each(['page=0', 'page=-1', 'page=1.5', 'page=10001', 'page=abc', 'view=other', 'status=other'])('rejects malformed dashboard parameters %s', query => {
  expect(dashboardState(new URLSearchParams(query)).valid).toBe(false)
  expect(render(setup(), `/movie-nights?${query}`)).toContain('That view is out of frame')
})
it.each(['scheduled', 'finalized', 'cancelled'] as const)('restores %s status and page from URL and resets page when changing filters', status => {
  const params = new URLSearchParams(`view=nights&status=${status}&page=3`)
  expect(dashboardState(params)).toEqual({ view: 'nights', status, page: 3, valid: true })
  expect(dashboardTarget(params, { status: 'all' })).toBe('/movie-nights?view=nights&status=all')
})
it('keeps future RSVP, voting and finalization interfaces absent from management routes', async () => {
  const client = setup()
  for (const path of ['/movie-nights/new', '/movie-nights/12']) {
    const html = await renderApp(client, path)
    expect(html).not.toContain('Cast vote'); expect(html).not.toContain('Finalize movie night'); expect(html).not.toContain('Accept invitation')
  }
})
it('gracefully renders an unavailable schedule instead of failing the entire list', () => {
  const html = render(setup(), '/movie-nights', <ul><MovieNightCard night={{ ...night, timezone: 'Unknown/Zone' }} owner={7} /></ul>)
  expect(html).toContain('Schedule unavailable'); expect(html).toContain('A little cinema')
})
