// Stateful UI fixtures. Actual storage/image processing is verified by the separate real-service journey.
export async function runProfileChecks(page, base, screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.__profileRevoked = []; const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = value => { window.__profileRevoked.push(value); revoke(value) }
  })
  let auth = null, failure = '', held = false, release
  const users = new Map([7, 8, 99].map(id => [id, { id, username: `profile_${id}`, email: `${id}@example.test`, avatar_url: null, email_verified_at: id === 99 ? null : '2026-11-03T00:00:00Z' }]))
  const profiles = new Map([...users].map(([id, user]) => [id, { user, bio: id === 8 ? 'User B private biography.' : null, member_since: '2026-11-03T00:00:00Z', statistics: { watched_count: 0, watchlist_count: 0, review_count: 0 } }]))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGN8AAAAASUVORK5CYII=', 'base64')
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' }
  await page.route('**/avatars/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }))
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    requests.push({ path, method })
    const reply = (body, status = 200) => route.fulfill({ status, headers, json: body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path.endsWith('/auth/me')) return auth ? reply({ data: auth }) : reply({ message: 'Unauthenticated.' }, 401)
    if (path.endsWith('/auth/login')) { const email = request.postDataJSON().email; auth = users.get(email.startsWith('other') ? 8 : email.startsWith('unverified') ? 99 : 7); return reply({ data: auth }) }
    if (path.endsWith('/auth/logout')) { auth = null; return route.fulfill({ status: 204, headers }) }
    if (path.endsWith('/auth/email/verification-status')) return reply({ data: auth })
    if (path.includes('/me/profile')) {
      if (!auth) return reply({ message: 'Unauthenticated.' }, 401)
      const profile = profiles.get(auth.id)
      if (failure === 'read' && method === 'GET') return reply({}, 503)
      if (path.endsWith('/avatar')) {
        if (method === 'POST') { if (held) await new Promise(resolve => { release = resolve }); if (failure === 'upload') return reply({}, 500); assert(request.headers()['content-type'].includes('multipart/form-data; boundary='), 'Upload missing multipart boundary'); profile.user.avatar_url = `http://127.0.0.1:8010/avatars/${profile.user.id}/${'a'.repeat(32)}.webp` }
        else { if (failure === 'remove') return reply({}, 500); profile.user.avatar_url = null }
      } else if (method === 'PATCH') {
        if (failure === 'edit') return reply({ errors: { username: ['This username is already taken.'] } }, 422)
        const values = request.postDataJSON(); profile.user.username = values.username; profile.bio = values.bio
      }
      return reply({ data: profile })
    }
    if (path.endsWith('/me/movies/550/library-state')) return reply({ data: { tmdb_id: 550, in_watchlist: profiles.get(auth?.id)?.statistics.watchlist_count > 0, watched_at: null } })
    if (path.endsWith('/me/watchlist/550') && method === 'DELETE') { profiles.get(auth.id).statistics.watchlist_count = 0; return route.fulfill({ status: 204, headers }) }
    if (path.endsWith('/me/watchlist') && method === 'POST') { profiles.get(auth.id).statistics.watchlist_count = 1; return reply({ data: { tmdb_id: 550, created_at: '2026-11-03T00:00:00Z' } }, 201) }
    if (path.endsWith('/me/reviews/550')) return reply({ data: null })
    if (path.endsWith('/movies/550/reviews')) return reply({ data: [{ id: 1, tmdb_id: 550, author: { id: 7, username: users.get(7).username, avatar_url: users.get(7).avatar_url }, body: 'A profile fixture review.', contains_spoilers: false, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' }], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1 } })
    if (path.endsWith('/movies/550/ratings')) return reply({ data: { tmdb_id: 550, average_rating: null, total_ratings: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } })
    if (path.endsWith('/me/ratings/550')) return reply({ data: null })
    if (path.endsWith('/movies/550/experience')) return reply({ data: { tmdb_id: 550, tagline: null, trailer: null, cast: [], directors: [], related: [] }, meta: { stale: false } })
    if (path.endsWith('/movies/550')) return reply({ data: { tmdb_id: 550, title: 'Profile journey fixture', poster_path: null, backdrop_path: null, overview: 'Synthetic fixture', release_date: '2025-01-01', runtime: 90, genres: [], tmdb_rating: null, tmdb_vote_count: 0 }, meta: { stale: false } })
    return reply({ data: [], meta: { page: 1, per_page: 20, total_pages: 0, total_results: 0 } })
  })
  const login = async email => { if (!page.url().endsWith('/login')) await page.goto(`${base}/login`); await page.getByLabel('Email address', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill('Test-only-password-25!'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(email.startsWith('unverified') ? '**/verify-email' : `${base}/`) }
  const logout = async () => { await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForURL('**/login') }
  const open = async () => { await page.getByRole('link', { name: /^Your profile,/ }).click(); await page.getByRole('heading', { name: `@${auth.username}`, exact: true }).waitFor() }
  const select = async (name = 'avatar.png', mimeType = 'image/png', buffer = png) => page.getByLabel('Choose an image', { exact: true }).setInputFiles({ name, mimeType, buffer })
  await page.goto(`${base}/profile`); await page.waitForURL('**/login')
  await login('fan@example.test'); failure = 'read'; await page.getByRole('link', { name: /^Your profile,/ }).click()
  await page.getByRole('button', { name: 'Retry profile', exact: true }).waitFor(); failure = ''; await page.getByRole('button', { name: 'Retry profile', exact: true }).click(); await page.getByRole('heading', { name: '@profile_7', exact: true }).waitFor()
  assert(await page.getByText('7@example.test', { exact: true }).count() === 1, 'Missing owner email')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).focus(); await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'Profile dialog did not contain Tab focus')
  await dialog.getByLabel('Username', { exact: true }).fill('ab'); await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); await dialog.getByText('Use 3–30 letters, numbers or underscores.', { exact: true }).waitFor()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); assert(await dialog.getByLabel('Username', { exact: true }).inputValue() === 'ab', 'Closing the editor silently discarded the draft')
  await dialog.getByLabel('Username', { exact: true }).fill('  NEW_FAN_25  '); await dialog.getByLabel('Biography', { exact: true }).fill('🎬'.repeat(501)); assert(await dialog.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), 'Oversized bio not blocked')
  await dialog.getByLabel('Biography', { exact: true }).fill('A new perspective.\n<script>window.__profileXss=1</script>'); failure = 'edit'; await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); await dialog.getByText('This username is already taken.', { exact: true }).waitFor(); assert((await dialog.getByLabel('Biography', { exact: true }).inputValue()).includes('new perspective'), 'Failure discarded biography')
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); if (screenshots) await dialog.screenshot({ path: `${screenshots}/profile-editor-${width}.png` }); assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), `Editor overflow ${width}`) }
  failure = ''; await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('Your profile was updated.', { exact: true }).waitFor(); await page.getByRole('link', { name: 'Your profile, new_fan_25', exact: true }).waitFor()
  assert(await page.evaluate(() => window.__profileXss) === undefined, 'Bio markup executed')
  await page.reload(); await page.getByRole('heading', { name: '@new_fan_25', exact: true }).waitFor()
  await select('x.svg', 'image/svg+xml', Buffer.from('<svg/>')); await page.getByRole('alert').filter({ hasText: 'JPEG, PNG or WebP' }).waitFor()
  await select('big.png', 'image/png', Buffer.alloc(2097153)); await page.getByRole('alert').filter({ hasText: '2 MiB' }).waitFor()
  await select(); await page.getByText('Preview · not saved', { exact: true }).waitFor(); assert(!auth.avatar_url, 'Local preview changed confirmed avatar')
  failure = 'upload'; await page.getByRole('button', { name: 'Upload selected image', exact: true }).click(); await page.getByRole('alert').waitFor(); assert(!auth.avatar_url && await page.getByText('Preview · not saved', { exact: true }).count(), 'Failed avatar upload lost preview or confirmed a save')
  failure = ''; await page.getByRole('button', { name: 'Upload selected image', exact: true }).click(); await page.getByText('Your profile picture was updated.', { exact: true }).waitFor(); assert(await page.locator('.account-profile img').isVisible(), 'Navigation avatar did not update'); assert(await page.evaluate(() => window.__profileRevoked.length > 0), 'Preview URL not revoked after save')
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Profile overflow ${width}`); if (screenshots) await page.locator('.profile-page').screenshot({ path: `${screenshots}/profile-${width}.png`, style: '.app-header { visibility: hidden !important }' }) }
  await page.goto(`${base}/movies/550`); await page.getByRole('article', { name: 'Review by new_fan_25', exact: true }).waitFor(); assert(await page.locator('.review-avatar img').isVisible(), 'Review author avatar did not refresh')
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click(); await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor(); await open(); assert(await page.locator('.profile-stat').filter({ hasText: 'On your watchlist' }).innerText() === '1\nOn your watchlist ↗', 'Watchlist mutation did not refresh cached profile counts')
  failure = 'remove'; await page.getByRole('button', { name: 'Remove picture', exact: true }).click(); await page.getByRole('alert').waitFor(); assert(auth.avatar_url, 'Failed removal cleared confirmed avatar')
  failure = ''; await page.getByRole('button', { name: 'Remove picture', exact: true }).click(); await page.getByText('Your profile picture was removed.', { exact: true }).waitFor(); assert(!await page.locator('.account-profile img').count(), 'Removal left a stale navigation avatar')
  await select(); held = true; await page.getByRole('button', { name: 'Upload selected image', exact: true }).click(); await page.getByRole('button', { name: 'Uploading…', exact: true }).waitFor(); assert(await page.getByLabel('Choose an image', { exact: true }).isDisabled(), 'Pending avatar selection enabled')
  await logout(); await login('other@example.test'); await open(); await page.getByText('User B private biography.', { exact: true }).waitFor(); held = false; release(); await page.waitForTimeout(150)
  assert(await page.getByRole('heading', { name: '@profile_8', exact: true }).count() === 1 && !await page.locator('.account-profile img').count(), 'Stale upload changed the next account')
  await page.emulateMedia({ reducedMotion: 'reduce' }); assert(await page.locator('a.profile-stat').first().evaluate(el => getComputedStyle(el).transitionDuration === '0s'), 'Profile card ignores reduced motion')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); await page.keyboard.press('Escape'); assert(await page.getByRole('button', { name: 'Edit profile', exact: true }).evaluate(el => el === document.activeElement), 'Profile dialog did not restore focus')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); await page.getByRole('dialog').getByLabel('Username', { exact: true }).fill('long_profile_name_'.repeat(2).slice(0, 30)); await page.getByRole('dialog').getByLabel('Biography', { exact: true }).fill('Unbrokenword'.repeat(42).slice(0, 500)); await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('Your profile was updated.', { exact: true }).waitFor(); await page.setViewportSize({ width: 375, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long username/bio overflowed mobile profile'); if (screenshots) await page.locator('.profile-page').screenshot({ path: `${screenshots}/profile-long-375.png`, style: '.app-header { visibility: hidden !important }' })
  await logout(); await login('unverified@example.test').catch(() => {}); await page.waitForURL('**/verify-email')
  assert(errors.length === 0, errors.join('\n'))
  return { requests: requests.length, errors, checks: 'Private guards/retry; Unicode and failed edits; auth/navigation synchronization; multipart preview/upload/failure/removal; object URL cleanup; refreshed review author and library count; stale upload/account isolation; keyboard/reduced motion; 375/768/1440 screenshots' }
}
