// Run with Playwright MCP browser_run_code_unsafe(filename: this file).
/* eslint-disable no-unused-expressions -- The MCP runner evaluates this function expression. */
// All movie, account, rating, and review data are browser-only fixtures.
async (page) => {
  await page.unrouteAll()
  let user = null, own = null, rating = null, rows = [], fail = false, delay = 0
  const writes = []
  const fixtureUser = { id: 70001, username: 'visual_fixture', email: 'visual@example.test', email_verified_at: '2026-11-12T00:00:00Z', avatar_url: null }
  const review = { id: 90001, tmdb_id: 687163, author: { id: 70001, username: 'visual_fixture', avatar_url: null }, body: 'A thoughtful, beautifully paced film.', contains_spoilers: false, created_at: '2026-11-12T00:00:00Z', updated_at: null }
  const headers = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, X-Requested-With', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }
  await page.route('**/localhost:8000/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method()
    const send = (data, status = 200) => route.fulfill({ json: data, status, headers })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/sanctum/csrf-cookie') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/movies/687163') return send({ data: { tmdb_id: 687163, title: 'Visual fixture film', original_title: 'Visual fixture film', poster_path: null, backdrop_path: null, overview: 'A short story for checking the movie detail layout.', release_date: '2026-11-12', runtime: 105, original_language: 'en', genres: [{ id: 18, name: 'Drama' }], tmdb_rating: 7.8, tmdb_vote_count: 120 }, meta: { stale: false } })
    if (path === '/api/v1/movies/687163/experience') return send({ data: { tmdb_id: 687163, tagline: null, trailer: null, directors: [], cast: [], related: [] }, meta: { stale: false } })
    if (path.endsWith('/auth/me')) return send({ data: user }, user ? 200 : 401)
    if (path.endsWith('/me/access')) return send({ data: { role: 'user', account_status: 'active' } })
    if (path.endsWith('/library-state')) return send({ data: { tmdb_id: 687163, in_watchlist: false, watched_at: null } })
    if (path.endsWith('/me/collections')) return send({ data: [], meta: { page: 1, total_pages: 0, total_results: 0 } })
    if (path.endsWith('/me/reviews/687163')) return send({ data: own })
    if (path.endsWith('/me/ratings/687163')) {
      if (method !== 'GET') { writes.push({ method, path }); rating = method === 'DELETE' ? null : { tmdb_id: 687163, rating: req.postDataJSON().rating, updated_at: null } }
      return send({ data: rating })
    }
    if (path.endsWith('/687163/ratings')) return send({ data: { tmdb_id: 687163, average_rating: rating?.rating ?? null, total_ratings: rating ? 1 : 0, distribution: { 1: 0, 2: 0, 3: 0, 4: rating ? 1 : 0, 5: 0 } } })
    if (/\/687163\/reviews(?:\/90001)?$/.test(path)) {
      if (method === 'GET') return send({ data: rows, meta: { page: 1, per_page: 20, total_pages: rows.length ? 1 : 0, total_results: rows.length } })
      writes.push({ method, path })
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      if (fail) return send({ message: 'Fixture unavailable' }, 503)
      own = method === 'DELETE' ? null : { ...review, ...req.postDataJSON() }; rows = own ? [own] : []
      return method === 'DELETE' ? route.fulfill({ status: 204, headers }) : send({ data: own })
    }
    if (method !== 'GET') throw new Error('Unmocked write blocked: ' + path)
    await route.continue()
  })
  const out = []
  const open = async () => {
    await page.goto('http://localhost:5173/movies/687163')
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 })
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
    await page.locator('.community-reviews').scrollIntoViewIfNeeded({ timeout: 20000 })
    await page.locator('.community-rating-panel').waitFor({ timeout: 15000 })
    await page.locator('.rating-distribution li').first().waitFor({ timeout: 15000 })
    await page.waitForFunction(() => !document.querySelector('.review-loading'))
  }
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const state of ['guest', 'empty', 'rating', 'review', 'both', 'many']) {
      user = state === 'guest' ? null : fixtureUser
      own = ['review', 'both'].includes(state) ? review : null
      rating = ['rating', 'both'].includes(state) ? { tmdb_id: 687163, rating: 4, updated_at: null } : null
      rows = state === 'many' ? [review, { ...review, id: 90002, author: { ...review.author, id: 70002, username: 'second_fixture' }, body: 'Long review. '.repeat(100) }, { ...review, id: 90003, contains_spoilers: true, body: 'Secret fixture ending.' }] : own ? [own] : []
      await open()
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Overflow: ' + width + ':' + state)
      if (await page.locator('.rating-distribution li').count() !== 5) throw new Error('Missing rating distribution')
      if (state === 'many' && await page.getByText('Secret fixture ending.').count()) throw new Error('Spoiler leaked')
      out.push({ width, state, cards: await page.locator('.review-card').count() })
      if (width === 1440 && state === 'both') await page.locator('.community-reviews').screenshot({ path: 'C:/Users/Hasan/Desktop/ua/sem 7/web 2/project/VYBE/docs/development/evidence/2026-11-12-restored-rating-desktop.png', animations: 'disabled' })
      if (width === 360 && state === 'many') await page.locator('.community-reviews').screenshot({ path: 'C:/Users/Hasan/Desktop/ua/sem 7/web 2/project/VYBE/docs/development/evidence/2026-11-12-restored-rating-mobile.png', animations: 'disabled' })
    }
  }
  user = fixtureUser; own = null; rating = null; rows = []; await open()
  await page.getByRole('button', { name: 'Write a review', exact: true }).click()
  await page.getByLabel('Your review', { exact: true }).fill('A fixture draft without a rating.')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Write a review', exact: true }).click()
  if (await page.getByLabel('Your review', { exact: true }).inputValue() !== 'A fixture draft without a rating.') throw new Error('Draft lost')
  fail = true; delay = 900
  await page.getByRole('button', { name: 'Publish review', exact: true }).click()
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor()
  await page.getByText('The service is temporarily unavailable.', { exact: false }).waitFor()
  if (!await page.getByRole('dialog').count()) throw new Error('Failure closed draft')
  fail = false; delay = 0
  await page.getByRole('button', { name: 'Publish review', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  if (writes.some(write => write.path.includes('/ratings/'))) throw new Error('Review unexpectedly wrote rating')
  await page.getByRole('button', { name: 'Edit your review', exact: true }).click()
  await page.getByLabel('Your review', { exact: true }).fill('Edited fixture review.')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Delete review by visual_fixture', exact: true }).click()
  await page.getByRole('button', { name: 'Delete review', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.getByRole('radio', { name: '4 stars', exact: true }).click()
  await page.getByText('Your 4-star rating is saved.').waitFor()
  if (!writes.some(write => write.method === 'PUT' && write.path.endsWith('/me/ratings/687163'))) throw new Error('Rating write missing')
  await page.getByRole('button', { name: 'Remove rating' }).click()
  await page.getByText('Your rating was removed.').waitFor()
  if (!writes.some(write => write.method === 'DELETE' && write.path.endsWith('/me/ratings/687163'))) throw new Error('Rating delete missing')
  await page.unrouteAll()
  return { layouts: out, writes, draftPreserved: true, pendingFailureRetryEditDelete: true, ratingAndReviewIndependent: true }
}
