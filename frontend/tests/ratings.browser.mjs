// Stateful Core HTTP fixtures exercise React behavior; real persistence is checked separately.
export async function runRatingsChecks(page, base, screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const errors = [], requests = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  let auth = null, failure = false, delayed = false, release, outage = false, statsFailure = false, ownFailure = false
  const ratings = new Map()
  const user = id => ({ id, username: `fixture_${id}`, email: `${id}@example.test`, avatar_url: null, email_verified_at: id === 9 ? null : '2026-11-03T00:00:00Z' })
  const movie = { tmdb_id: 550, title: 'The Quiet Horizon', poster_path: null, backdrop_path: null, overview: 'Synthetic browser fixture.', release_date: '2025-01-01', tmdb_rating: 8.4, tmdb_vote_count: 1200 }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' }
  const statistics = () => {
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    for (const rating of ratings.values()) distribution[rating]++
    return { tmdb_id: 550, total_ratings: ratings.size, average_rating: ratings.size ? Math.round([...ratings.values()].reduce((a, b) => a + b, 0) / ratings.size * 100) / 100 : null, distribution }
  }
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const reply = (data, status = 200) => route.fulfill({ status, headers, json: data })
    const empty = () => route.fulfill({ status: 204, headers })
    if (method === 'OPTIONS') return empty()
    requests.push({ path, method })
    if (path.endsWith('/auth/me')) return auth ? reply({ data: auth }) : reply({}, 401)
    if (path.endsWith('/auth/login')) { auth = user(request.postDataJSON().email.startsWith('other') ? 8 : 7); return reply({ data: auth }) }
    if (path.endsWith('/auth/logout')) { auth = null; return empty() }
    if (method === 'GET' && /\/movies\/\d+\/reviews$/.test(path)) return reply({ data: [], meta: { page: 1, per_page: 20, total_pages: 0, total_results: 0 } })
    if (path.endsWith('/email/verification-status')) return reply({ data: { verified: false, email: auth?.email } })
    if (path === '/api/v1/movies/550/ratings') return statsFailure ? reply({}, 500) : reply({ data: statistics() })
    if (path.endsWith('/experience')) return reply({ data: { tmdb_id: 550, tagline: null, trailer: { key: 'official123', site: 'YouTube', type: 'Trailer', official: true, name: 'Fixture trailer' }, directors: [], cast: [], related: [] }, meta: { stale: false } })
    if (path === '/api/v1/movies/550') return reply({ data: { ...movie, runtime: 125, original_title: null, original_language: 'en', genres: [] }, meta: { stale: false } })
    if (/\/movies\/(popular|search)$/.test(path)) return reply({ data: [movie], meta: { page: 1, total_pages: 1, total_results: 1 } })
    if (!auth) return reply({}, 401)
    if (!auth.email_verified_at) return reply({}, 403)
    if (method === 'GET' && /\/me\/reviews\/\d+$/.test(path)) return reply({ data: null })
    if (path.endsWith('/library-state')) return reply({ data: { tmdb_id: 550, in_watchlist: true, watched_at: '2026-11-01T00:00:00Z' } })
    if (path === '/api/v1/me/collections') return reply({ data: [{ id: 1, name: 'Favorites', description: null, movie_count: 1, contains_movie: true, created_at: '2026-11-01T00:00:00Z', updated_at: null }], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1 } })
    if (path === '/api/v1/me/ratings/550') {
      const owner = auth.id
      if (method === 'GET') return ownFailure ? reply({}, 500) : reply({ data: ratings.has(owner) ? { tmdb_id: 550, rating: ratings.get(owner), updated_at: '2026-11-03T00:00:00Z' } : null })
      if (delayed) await new Promise(resolve => { release = resolve })
      if (failure) return reply({ message: 'never expose SQL secret' }, 500)
      if (method === 'DELETE') { ratings.delete(owner); return empty() }
      if (outage && !ratings.has(owner)) return reply({}, 503)
      ratings.set(owner, request.postDataJSON().rating)
      return reply({ data: { tmdb_id: 550, rating: ratings.get(owner), updated_at: '2026-11-03T00:00:00Z' } })
    }
    return reply({}, 501)
  })
  const section = page.locator('.community-ratings')
  const stars = section.getByRole('radio')
  const choose = n => section.getByRole('radio', { name: `${n} ${n === 1 ? 'star' : 'stars'}`, exact: true }).locator('..').click()
  const confirmed = n => section.getByRole('radio', { name: `${n} ${n === 1 ? 'star' : 'stars'}`, exact: true }).isChecked()
  const saved = n => section.getByText(`Your ${n}-star rating is saved.`, { exact: true }).waitFor()
  const login = async email => {
    await page.goto(`${base}/login`)
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill('Test-only-password-23!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.goto(`${base}/movies/550`)
    await stars.first().waitFor()
  }
  const logout = async () => { await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForResponse(r => r.url().endsWith('/auth/me') && r.status() === 401).catch(() => {}); await page.goto(`${base}/movies/550`) }

  await page.goto(`${base}/movies/550`)
  await section.getByText('No community ratings yet.', { exact: true }).waitFor()
  assert(!requests.some(r => r.path === '/api/v1/me/ratings/550'), 'Guest fetched private rating')
  await choose(5)
  await page.waitForURL('**/login')
  await login('fan@example.test')
  assert(await stars.count() === 5 && !await confirmed(5), 'Initial personal rating incorrect')
  await stars.nth(3).locator('..').hover()
  assert(await section.locator('.peek-option.is-previewed').count() === 4, 'Peek preview wave missing')
  assert(ratings.size === 0, 'Preview persisted a rating')
  delayed = true
  await choose(5)
  await page.waitForFunction(() => document.querySelector('.peek-rating')?.disabled)
  assert(!await confirmed(5), 'Pending rating displayed as confirmed')
  assert(await section.locator('.peek-confirmed').count() === 0, 'Pending save animated success')
  delayed = false; release()
  await saved(5)
  assert(await confirmed(5) && ratings.get(7) === 5, 'Save failed')
  await section.getByText('5.00', { exact: false }).waitFor()
  await choose(3); await saved(3)
  await page.reload(); await section.getByRole('radio', { name: '3 stars', exact: true }).waitFor()
  assert(await confirmed(3), 'Refresh lost confirmed rating')
  failure = true; await choose(4)
  await section.getByRole('alert').filter({ hasText: 'last confirmed' }).waitFor()
  assert(await confirmed(3) && !await confirmed(4), 'Failed write changed radio state')
  assert(!await section.getByText('Your 4-star rating is saved.', { exact: true }).count(), 'Failed write reported success')
  failure = false; await choose(4); await saved(4)
  await stars.nth(3).focus(); await page.keyboard.press('ArrowLeft'); await saved(3)
  assert(await confirmed(3), 'Native keyboard rating failed')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stars.nth(4).locator('..').hover()
  assert(await section.locator('.peek-option.is-target .peek-glyph').evaluate(e => getComputedStyle(e).transform === 'none'), 'Reduced motion still lifts stars')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await section.scrollIntoViewIfNeeded()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Rating overflow at ${width}`)
    if (screenshots) await section.screenshot({ path: `${screenshots}/ratings-${width}.png` })
  }
  checks.push('Guest public reads/sign-in; Peek preview, pending server confirmation, save/update/reload, failed write/retry, native keyboard, reduced motion, three responsive widths')
  outage = true
  await choose(2); await saved(2)
  failure = true; await section.getByRole('button', { name: 'Remove rating', exact: true }).click()
  await section.getByRole('alert').filter({ hasText: 'last confirmed' }).waitFor()
  assert(await confirmed(2) && ratings.get(7) === 2, 'Failed removal removed rating')
  failure = false; await section.getByRole('button', { name: 'Remove rating', exact: true }).click()
  await section.getByText('Your rating was removed.', { exact: true }).waitFor()
  await choose(5); await section.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor()
  assert(!ratings.has(7) && !await confirmed(5), 'New rating persisted during Catalog outage')
  outage = false; await choose(5); await saved(5)
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click()
  assert(await page.getByRole('checkbox').isChecked(), 'Rating changed collection state')
  await page.keyboard.press('Escape')
  assert(await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).count() === 1 && await page.getByRole('button', { name: 'Remove from Watched', exact: true }).count() === 1, 'Rating changed library status')
  await logout(); await login('other@example.test')
  assert(!await confirmed(5), 'New account inherited old personal rating')
  await choose(1); await saved(1)
  await section.getByText('3.00', { exact: false }).waitFor()
  assert(ratings.get(7) === 5 && ratings.get(8) === 1, 'User isolation broken')
  statsFailure = true; await page.reload()
  await section.getByRole('button', { name: 'Retry community ratings', exact: true }).waitFor()
  assert(await confirmed(1), 'Public stats failure blocked personal rating')
  statsFailure = false; await section.getByRole('button', { name: 'Retry community ratings', exact: true }).click()
  await section.getByText('3.00', { exact: false }).waitFor()
  ownFailure = true; await page.reload(); await section.getByRole('button', { name: 'Retry your rating', exact: true }).waitFor()
  ownFailure = false; await section.getByRole('button', { name: 'Retry your rating', exact: true }).click(); await stars.first().waitFor()
  assert(await confirmed(1), 'Personal retry lost rating')
  auth = user(9); await page.reload(); await page.waitForURL('**/verify-email')
  checks.push('Existing update/removal during Catalog outage; failed removal; new-rating outage; library/collection independence; logout/account isolation and two-user aggregates; public/personal retries; unverified guard')
  assert(errors.length === 0, errors.join('\n'))
  return { checks, requests: requests.length, errors }
}
