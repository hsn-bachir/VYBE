import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { Avatar } from '../../../components/ui/Avatar'
import { authKey } from '../../auth/hooks/useAuth'
import { avatarFileError, changeProfile, profileError, readProfile } from '../api/profileApi'
import { profileKey, profileOptions, synchronizeProfile } from '../hooks/useProfile'
import ProfilePage from '../pages/ProfilePage'
import { ProfileEditor } from '../components/ProfileEditor'
import { AvatarEditor } from '../components/AvatarEditor'
import type { Profile } from '../types/profile.types'

const user = { id: 7, username: 'movie_fan', email: 'fan@example.test', email_verified_at: '2026-11-03T00:00:00Z', avatar_url: null }
const profile: Profile = { user, bio: 'Cinema\nStorytelling', member_since: '2026-11-03T00:00:00Z', statistics: { watched_count: 38, watchlist_count: 12, review_count: 8 } }
const cache = () => { const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } }); client.setQueryData(authKey, user); return client }
const render = (client: QueryClient) => renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><ProfilePage /></MemoryRouter></QueryClientProvider>)
beforeEach(() => vi.restoreAllMocks())

it('uses only the Core profile endpoint and forwards cancellation', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: profile } }), signal = new AbortController().signal
  expect(await readProfile(signal)).toEqual(profile); expect(get).toHaveBeenCalledWith('/api/v1/me/profile', { signal })
  expect(profileOptions(7).queryKey).not.toEqual(profileOptions(8).queryKey); expect(profileOptions(0).enabled).toBe(false)
  expect(profileOptions(7).retry).toBe(false)
})
it('bootstraps CSRF and separates JSON, multipart and removal operations', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({}), patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: profile } }), post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: profile } }), del = vi.spyOn(api, 'delete').mockResolvedValue({ data: { data: profile } })
  await changeProfile({ action: 'edit', values: { username: 'new_fan', bio: null } }, () => true)
  expect(patch).toHaveBeenCalledWith('/api/v1/me/profile', { username: 'new_fan', bio: null })
  const file = new File(['image'], 'avatar.png', { type: 'image/png' }); await changeProfile({ action: 'upload', file }, () => true)
  expect(post.mock.calls[0][0]).toBe('/api/v1/me/profile/avatar'); expect((post.mock.calls[0][1] as FormData).get('avatar')).toBe(file)
  await changeProfile({ action: 'remove' }, () => true); expect(del).toHaveBeenCalledWith('/api/v1/me/profile/avatar'); expect(get).toHaveBeenCalledTimes(3)
})
it('does not write when the account changes during CSRF', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({}); const patch = vi.spyOn(api, 'patch')
  await expect(changeProfile({ action: 'edit', values: { username: 'fan', bio: null } }, () => false)).rejects.toThrow('account changed'); expect(patch).not.toHaveBeenCalled()
})
it('synchronizes the existing auth identity and profile without invalidating movie metadata', async () => {
  const client = cache(), updated = { ...profile, user: { ...user, username: 'updated', avatar_url: 'https://core.test/avatars/7/a.webp' } }
  client.setQueryData(['movies', 'detail', '550'], 'unchanged'); const invalidate = vi.spyOn(client, 'invalidateQueries')
  expect(await synchronizeProfile(client, 7, updated)).toBe(true); expect(client.getQueryData(authKey)).toEqual(updated.user); expect(client.getQueryData(profileKey(7))).toEqual(updated)
  const predicate = invalidate.mock.calls[0][0]!.predicate!
  expect(predicate({ queryKey: ['movies', 'reviews', 550] } as never)).toBe(true); expect(predicate({ queryKey: ['me', 7, 'review', 550] } as never)).toBe(true)
  expect(predicate({ queryKey: ['movies', 'detail', '550'] } as never)).toBe(false); expect(predicate({ queryKey: ['library', 7] } as never)).toBe(false)
})
it('guards stale mutation callbacks before and after cancellation', async () => {
  const client = cache(); client.setQueryData(authKey, { ...user, id: 8 }); expect(await synchronizeProfile(client, 7, profile)).toBe(false)
  client.setQueryData(authKey, user); vi.spyOn(client, 'cancelQueries').mockImplementation(async () => { client.setQueryData(authKey, { ...user, id: 8 }) })
  expect(await synchronizeProfile(client, 7, profile)).toBe(false); expect(client.getQueryData(profileKey(7))).toBeUndefined(); expect(client.getQueryData(authKey)).toMatchObject({ id: 8 })
})
it('renders real identity, private information, statistics and Library links', () => {
  const client = cache(); client.setQueryData(profileKey(7), profile); const html = render(client)
  for (const value of ['@movie_fan', 'Cinema', '38', '12', '8', 'fan@example.test', 'Verified', '/library/watchlist', '/library/watched', '/library/collections']) expect(html).toContain(value)
  expect(html).not.toContain('/reviews'); expect(html).toContain('Edit profile')
})
it('supports zero statistics, empty bio, legacy dates and loading states', () => {
  const client = cache(); expect(render(client)).toContain('aria-label="Loading profile"')
  client.setQueryData(profileKey(7), { ...profile, bio: null, member_since: null, statistics: { watched_count: 0, watchlist_count: 0, review_count: 0 } }); const html = render(client)
  expect(html).toContain('Date unavailable'); expect(html).toContain('Tell your story here'); expect(html).not.toContain('NaN')
})
it('does not show another account’s cached bio or counts', () => {
  const client = cache(); client.setQueryData(profileKey(7), profile); client.setQueryData(authKey, { ...user, id: 8 }); const html = render(client)
  expect(html).not.toContain('Cinema'); expect(html).not.toContain('38'); expect(html).toContain('aria-label="Loading profile"')
})
it('renders safe Avatar fallbacks instead of executable URLs', () => {
  const html = renderToStaticMarkup(<Avatar username="" url="javascript:alert(1)" />); expect(html).not.toContain('<img'); expect(html).toContain('V')
  expect(renderToStaticMarkup(<Avatar username="fan" url="https://core.test/avatar.webp" />)).toContain('referrerPolicy="no-referrer"')
})
it.each([['image/svg+xml', 100, 'JPEG'], ['image/gif', 100, 'JPEG'], ['image/png', 2097153, '2 MiB'], ['image/png', 0, 'empty']])('rejects invalid selected avatar %s/%s', (type, size, expected) => { expect(avatarFileError({ type: type as string, size: size as number })).toContain(expected) })
it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts supported local selection %s', type => { expect(avatarFileError({ type, size: 2097152 })).toBeNull() })
it('prepopulates Unicode editing, supports bio clearing and pending controls', () => {
  const html = renderToStaticMarkup(<ProfileEditor initial={{ username: user.username, bio: '🎬'.repeat(500) }} pending error={null} onSave={() => {}} onClose={() => {}} />)
  expect(html).toContain('500 / 500'); expect(html).toContain('movie_fan'); expect(html).toContain('disabled=""'); expect(html).toContain('Saving…')
})
it('keeps an invalid draft visible and displays field errors', () => {
  const html = renderToStaticMarkup(<ProfileEditor initial={{ username: 'draft', bio: 'kept' }} pending={false} error={{ isAxiosError: true, response: { status: 422, data: { errors: { username: ['Already taken'] } } } }} onSave={() => {}} onClose={() => {}} />)
  expect(html).toContain('Already taken'); expect(html).toContain('kept'); expect(html).toContain('draft')
})
it('exposes an accessible file input and confirmed avatar removal', () => {
  const html = renderToStaticMarkup(<AvatarEditor username="fan" url="https://core.test/a.webp" pending error={null} onUpload={() => {}} onRemove={() => {}} />)
  expect(html).toContain('Choose an image'); expect(html).toContain('accept="image/jpeg,image/png,image/webp"'); expect(html).toContain('Remove picture'); expect(html).toContain('disabled=""'); expect(html).not.toContain('not saved')
})
it.each([401, 403, 413, 419, 422, 429, 500, 503])('reports safe profile failures %s', status => { expect(profileError({ isAxiosError: true, response: { status, data: { message: 'SQL secret' } } })).not.toMatch(/SQL secret|Invalid email or password/) })
