import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../lib/api/client'
import { authKey, isPrivateSessionQuery } from '../auth/hooks/useAuth'
import ForYouPage from './ForYouPage'
import { recommendationKey, recommendationOptions, refreshRecommendations, type RecommendationFeed } from './recommendations'

const movie = { tmdb_id: 1, title: 'Fixture film', overview: null, poster_path: null, backdrop_path: null, release_date: null, tmdb_rating: 8, tmdb_vote_count: 500 }
const feed: RecommendationFeed = { data: { sections: [{ id: 'top', title: 'Top Picks for You', explanation: 'Selected from your movie interests.', movies: [movie] }] }, meta: { personalized: true, partial: false } }
const cache = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } })
const render = (client: QueryClient) => renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><ForYouPage /></MemoryRouter></QueryClientProvider>)
beforeEach(() => vi.restoreAllMocks())
it('uses an authenticated private owner query, cancellation, and bounded timeout', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: feed })
  const client = cache()
  await client.fetchQuery(recommendationOptions(1))
  await client.fetchQuery(recommendationOptions(1))
  expect(get).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledWith('/api/v1/me/recommendations', expect.objectContaining({ timeout: 30_000, signal: expect.any(AbortSignal) }))
  expect(recommendationKey(1)).not.toEqual(recommendationKey(2))
  expect(isPrivateSessionQuery({ queryKey: recommendationKey(1) })).toBe(true)
  expect(recommendationOptions(0).enabled).toBe(false)
})
it('removes confirmed saved films from every section without touching other owners', async () => {
  const client = cache()
  client.setQueryData(recommendationKey(1), { ...feed, data: { sections: [...feed.data.sections, { ...feed.data.sections[0], id: 'genre' }] } })
  client.setQueryData(recommendationKey(2), feed)
  await refreshRecommendations(client, 1, 1)
  expect(client.getQueryData<RecommendationFeed>(recommendationKey(1))?.data.sections.every(section => section.movies.length === 0)).toBe(true)
  expect(client.getQueryData(recommendationKey(2))).toEqual(feed)
})
it('renders skeletons, honest cold start, sections and empty state', () => {
  const client = cache()
  client.setQueryData(authKey, { id: 1, username: 'fixture', email_verified_at: '2026-01-01' })
  expect(render(client)).toContain('Finding your next films')
  client.setQueryData(recommendationKey(1), feed)
  const html = render(client)
  expect(html).toContain('Top Picks for You')
  expect(html).toContain('Fixture film')
  expect(html).toContain('Mark Fixture film watched')
  client.setQueryData(recommendationKey(1), { ...feed, meta: { personalized: false, partial: false }, data: { sections: [{ ...feed.data.sections[0], title: 'Worth discovering' }] } })
  expect(render(client)).toContain('Start exploring')
  client.setQueryData(recommendationKey(1), { ...feed, data: { sections: [] } })
  expect(render(client)).toContain('No eligible films')
})
it('offers retry after failure instead of an endless skeleton', async () => {
  const client = cache()
  client.setQueryData(authKey, { id: 1, email_verified_at: '2026-01-01' })
  vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
  await client.fetchQuery(recommendationOptions(1)).catch(() => {})
  expect(render(client)).toContain('Try again')
})
