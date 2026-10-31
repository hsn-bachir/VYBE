// Stateful browser fixtures validate UI behavior; database persistence is checked separately.
export async function runLibraryChecks(page, base = 'http://127.0.0.1:5181', screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const checks = []
  const requests = []
  const errors = []
  const onError = error => errors.push(error.message)
  page.on('pageerror', onError)
  let auth = 'verified', owner = 7, outage = false, missing = false, trailerAvailable = true, failure = 0, delayed = false
  let releaseWrite
  const memberships = new Map()
  const lists = () => {
    if (!memberships.has(owner)) memberships.set(owner, { watchlist: new Map(), watched: new Map() })
    return memberships.get(owner)
  }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }
  const movie = id => ({ tmdb_id: id, title: id === 550 ? 'The Quiet Horizon' : `Test film ${id}`, overview: 'A browser test fixture: a journey across an unfamiliar world, and the people who make it feel like home. This data exists only in the acceptance test.', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', backdrop_path: '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg', release_date: '2025-01-02', tmdb_rating: 8.4, tmdb_vote_count: 1200 })
  const user = () => ({ id: owner, username: 'test_fan', email: 'fan@example.test', avatar_url: null, email_verified_at: auth === 'verified' ? '2026-10-31T00:00:00Z' : null })
  await page.unrouteAll({ behavior: 'wait' })
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const reply = (json, status = 200) => route.fulfill({ status, headers, json })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push({ path, method })
    if (path.endsWith('/auth/me')) return auth === 'guest' ? reply({ message: 'Unauthenticated.' }, 401) : reply({ data: user() })
    if (path.endsWith('/auth/logout')) { auth = 'guest'; return route.fulfill({ status: 204, headers }) }
    if (path.endsWith('/experience')) return reply({ data: { tmdb_id: 550, tagline: 'Some stories bring us home.', trailer: trailerAvailable ? { key: 'official123', site: 'YouTube', type: 'Trailer', official: true, name: 'Official trailer' } : null,
      directors: [{ tmdb_id: 30, name: 'Test Director' }], cast: Array.from({ length: 12 }, (_, i) => ({ tmdb_id: i + 1, name: `Test Actor ${i + 1}`, character: `Character ${i + 1}`, profile_path: null })), related: [551, 552, 553, 554, 555, 556].map(movie) }, meta: { stale: false } })
    if (/\/movies\/\d+$/.test(path)) return reply({ data: { ...movie(Number(path.split('/').at(-1))), runtime: 125, original_title: null, original_language: 'en', genres: [{ id: 18, name: 'Drama' }, { id: 878, name: 'Science Fiction' }] }, meta: { stale: false } })
    if (/\/movies\/(popular|search)$/.test(path)) return reply({ data: [movie(550)], meta: { page: 1, total_pages: 1, total_results: 1 } })
    if (auth === 'guest') return reply({ message: 'Unauthenticated.' }, 401)
    if (auth !== 'verified') return reply({ message: 'Unverified.' }, 403)
    if (path.endsWith('/library-state')) {
      const id = Number(path.split('/').at(-2))
      return reply({ data: { tmdb_id: id, in_watchlist: lists().watchlist.has(id), watched_at: lists().watched.get(id)?.watched_at ?? null } })
    }
    const match = path.match(/\/me\/(watchlist|watched)(?:\/(\d+))?$/)
    if (!match) return reply({}, 404)
    const kind = match[1], list = lists()[kind]
    if (method === 'POST') {
      if (delayed) await new Promise(resolve => { releaseWrite = resolve })
      if (failure) return reply({ message: 'private upstream details must stay hidden' }, failure)
      const id = request.postDataJSON().tmdb_id
      const entry = list.get(id) ?? { tmdb_id: id, created_at: '2026-10-31T10:00:00Z', ...(kind === 'watched' ? { watched_at: '2026-10-31T10:00:00Z' } : {}) }
      list.set(id, entry)
      return reply({ data: entry }, 201)
    }
    if (method === 'DELETE') { list.delete(Number(match[2])); return route.fulfill({ status: 204, headers }) }
    const p = Number(url.searchParams.get('page') || 1), rows = [...list.values()].reverse()
    return reply({ data: rows.slice((p - 1) * 20, p * 20).map(entry => ({ ...entry, movie: outage || missing ? null : movie(entry.tmdb_id), metadata_status: outage ? 'unavailable' : missing ? 'missing' : 'available' })), meta: { page: p, per_page: 20, total_pages: Math.ceil(rows.length / 20), total_results: rows.length, metadata_unavailable: outage && rows.length > 0 } })
  })
  // Exercise iframe creation without claiming real external playback in this deterministic test.
  let mediaRequests = 0
  await page.route('**/www.youtube-nocookie.com/**', route => { mediaRequests++; return route.fulfill({ contentType: 'text/html', body: '<p>Isolated player fixture</p>' }) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/movies/550`)
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Watch Trailer', exact: false }).waitFor()
  assert(mediaRequests === 0 && await page.locator('iframe').count() === 0, 'Player loaded before consent')
  const play = page.getByRole('button', { name: 'Watch Trailer', exact: false })
  await play.focus(); await page.keyboard.press('Enter')
  await page.locator('dialog[open] iframe').waitFor()
  assert(await page.locator('dialog iframe').getAttribute('src') === 'https://www.youtube-nocookie.com/embed/official123?autoplay=1&rel=0', 'Unsafe iframe URL')
  await page.getByRole('button', { name: 'Close trailer' }).focus()
  await page.keyboard.press('Escape')
  await page.locator('dialog').waitFor({ state: 'detached' })
  assert(await play.evaluate(el => el === document.activeElement), 'Trailer focus was not restored')
  checks.push('Trailer loads on keyboard activation only; Escape closes, unmounts iframe and restores focus')
  delayed = true
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).isDisabled(), 'Pending add was not disabled')
  assert(!await page.getByText('Saved to Watchlist.', { exact: true }).count(), 'Success preceded persistence')
  while (!releaseWrite) await new Promise(resolve => setTimeout(resolve, 20))
  delayed = false; releaseWrite()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  assert(lists().watchlist.has(550) && lists().watched.has(550), 'Watched removed watchlist')
  checks.push('Pending write disabled; success follows response; independent watchlist/watched state')
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.film-related').scrollIntoViewIfNeeded()
    await page.evaluate(async () => { await Promise.all([...document.querySelectorAll('.movie-image')].map(img => img.decode().catch(() => {}))) })
    await page.evaluate(() => window.scrollTo(0, 0))
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Detail overflow at ${width}`)
    if (screenshots) await page.screenshot({ path: `${screenshots}/details-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).waitFor()
  await page.reload()
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).waitFor()
  await page.getByRole('link', { name: 'Watched', exact: true }).click()
  await page.locator('time').waitFor()
  await page.getByRole('link', { name: 'Watchlist', exact: true }).click()
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).waitFor()
  assert(lists().watched.has(550), 'Watchlist removal changed watched')
  checks.push('Navigation/reload persistence, watched timestamps, library-to-detail return, independent removal')
  failure = 503
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor()
  assert(!lists().watchlist.has(550), 'Failed save changed state')
  assert(!await page.getByText('Saved to Watchlist.', { exact: true }).count(), 'Failed save announced success')
  failure = 0
  for (let id = 550; id < 573; id++) lists().watchlist.set(id, { tmdb_id: id, created_at: '2026-10-31T10:00:00Z' })
  await page.goto(`${base}/library/watchlist`)
  await page.getByRole('link', { name: /Next page/ }).click()
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).waitFor()
  assert(new URL(page.url()).searchParams.get('page') === '2', 'Pagination failed')
  outage = true
  await page.reload()
  await page.getByText(/Your saved films are safe/).waitFor()
  await page.getByRole('button', { name: 'Remove TMDB 550 from watchlist', exact: true }).click()
  await page.getByRole('heading', { name: 'TMDB 550', exact: true }).waitFor({ state: 'detached' })
  assert(!lists().watchlist.has(550), 'Outage removal failed')
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Library overflow at ${width}`)
    if (screenshots) await page.screenshot({ path: `${screenshots}/library-outage-${width}.png`, fullPage: true })
  }
  outage = false; missing = true
  await page.reload(); await page.getByText('Movie information is missing from the catalog.').first().waitFor()
  missing = false
  checks.push('Failed save has no success animation; pagination, missing metadata, preserved outage rows and removal')
  owner = 8
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor()
  auth = 'verified'
  await page.goto(`${base}/library/watchlist`)
  await page.getByRole('heading', { name: 'Your next great film starts here.' }).waitFor()
  assert(!await page.getByRole('link', { name: 'View The Quiet Horizon' }).count(), 'Previous account data leaked')
  trailerAvailable = false
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${base}/movies/550`)
  await page.getByText('No trailer is available for this movie.').waitFor()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  assert(await page.locator('.membership-pulse').first().evaluate(el => getComputedStyle(el).animationName) === 'none', 'Reduced motion ignored')
  auth = 'guest'; await page.goto(`${base}/movies/550`)
  await page.getByRole('link', { name: 'Sign in to save this movie' }).waitFor()
  await page.goto(`${base}/library`); await page.waitForURL('**/login')
  auth = 'unverified'; await page.goto(`${base}/library`); await page.waitForURL('**/verify-email')
  checks.push('New account isolation, no-trailer state, reduced-motion actions, guest and unverified guards')
  assert(!errors.length, errors.join('\n'))
  assert(requests.every(r => !r.path.includes('/internal/') && !r.path.includes('themoviedb')), 'Browser crossed service boundary')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  page.off('pageerror', onError)
  return { checks, requests: requests.length, mediaRequests, pageErrors: errors }
}
