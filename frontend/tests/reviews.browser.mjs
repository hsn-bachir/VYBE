// Stateful HTTP fixtures verify React behavior; real HTTP/MySQL persistence is checked separately.
export async function runReviewsChecks(page, base, screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const errors = [], requests = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  let auth = null, nextId = 1, failure = '', delayed = false, release, conflict = false, outage = false, listFailure = false, ownFailure = false
  const reviews = new Map()
  const user = id => ({ id, username: `fixture_${id}`, email: `${id}@example.test`, avatar_url: null, email_verified_at: id === 99 ? null : '2026-11-03T00:00:00Z' })
  const add = (owner, body, spoilers = false, created = '2026-11-01T00:00:00Z') => {
    const review = { id: nextId++, tmdb_id: 550, author: { id: owner, username: `fixture_${owner}`, avatar_url: null }, body, contains_spoilers: spoilers, created_at: created, updated_at: created }
    reviews.set(review.id, review); return review
  }
  const a = add(8, 'First hidden final-scene secret.', true), b = add(9, 'Second hidden ending secret.', true)
  const ownReview = owner => [...reviews.values()].find(r => r.author.id === owner) ?? null
  const movie = { tmdb_id: 550, title: 'The Quiet Horizon', poster_path: null, backdrop_path: null, overview: 'Synthetic browser fixture.', release_date: '2025-01-01', tmdb_rating: 8.4, tmdb_vote_count: 1200 }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const reply = (json, status = 200) => route.fulfill({ status, headers, json })
    const empty = () => route.fulfill({ status: 204, headers })
    if (method === 'OPTIONS') return empty()
    requests.push({ path, method })
    if (path.endsWith('/auth/me')) return auth ? reply({ data: auth }) : reply({}, 401)
    if (path.endsWith('/auth/login')) { auth = user(request.postDataJSON().email.startsWith('other') ? 8 : 7); return reply({ data: auth }) }
    if (path.endsWith('/auth/logout')) { auth = null; return empty() }
    if (path.endsWith('/email/verification-status')) return reply({ data: { verified: false, email: auth?.email } })
    if (path === '/api/v1/movies/550/ratings') return reply({ data: { tmdb_id: 550, average_rating: 4, total_ratings: 1, distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 0 } } })
    if (path.endsWith('/experience')) return reply({ data: { tmdb_id: 550, tagline: null, trailer: { key: 'official123', site: 'YouTube', type: 'Trailer', official: true, name: 'Fixture trailer' }, directors: [], cast: [], related: [] }, meta: { stale: false } })
    if (path === '/api/v1/movies/550') return reply({ data: { ...movie, runtime: 125, original_title: null, original_language: 'en', genres: [] }, meta: { stale: false } })
    if (/\/movies\/(popular|search)$/.test(path)) return reply({ data: [movie], meta: { page: 1, total_pages: 1, total_results: 1 } })
    const match = path.match(/^\/api\/v1\/movies\/550\/reviews(?:\/(\d+))?$/)
    if (match && method === 'GET') {
      if (listFailure) return reply({}, 500)
      const p = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('per_page') || 20)
      const rows = [...reviews.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
      return reply({ data: rows.slice((p - 1) * size, p * size), meta: { page: p, per_page: size, total_pages: Math.ceil(rows.length / size), total_results: rows.length } })
    }
    if (!auth) return reply({}, 401)
    if (!auth.email_verified_at) return reply({}, 403)
    if (path === '/api/v1/me/reviews/550') return ownFailure ? reply({}, 500) : reply({ data: ownReview(auth.id) })
    if (path.endsWith('/library-state')) return reply({ data: { tmdb_id: 550, in_watchlist: true, watched_at: '2026-11-01T00:00:00Z' } })
    if (path === '/api/v1/me/ratings/550') return reply({ data: { tmdb_id: 550, rating: 4, updated_at: '2026-11-03T00:00:00Z' } })
    if (path === '/api/v1/me/collections') return reply({ data: [{ id: 1, name: 'Favorites', description: null, movie_count: 1, contains_movie: true, created_at: '2026-11-01T00:00:00Z', updated_at: null }], meta: { page: 1, per_page: 20, total_pages: 1, total_results: 1 } })
    if (match) {
      const owner = auth.id, id = Number(match[1]), review = reviews.get(id), body = request.postData() ? request.postDataJSON() : {}
      if (delayed) await new Promise(resolve => { release = resolve })
      const action = method === 'POST' ? 'create' : method === 'PATCH' ? 'edit' : 'delete'
      if (failure === action) return reply({ message: 'never expose SQL secret' }, 500)
      if (method === 'POST') {
        if (conflict) { conflict = false; add(owner, 'Saved in another tab.', true, '2026-11-03T00:00:00Z') }
        if (ownReview(owner)) return reply({ message: 'A review already exists for this movie.', code: 'REVIEW_EXISTS' }, 409)
        if (outage) return reply({}, 503)
        return reply({ data: add(owner, body.body, body.contains_spoilers ?? false, '2026-11-03T00:00:00Z') }, 201)
      }
      if (!review || review.author.id !== owner) return reply({ message: 'Not found.' }, 404)
      if (method === 'DELETE') { reviews.delete(id); return empty() }
      Object.assign(review, body, { updated_at: '2026-11-04T00:00:00Z' }); return reply({ data: review })
    }
    return reply({}, 501)
  })
  const section = page.locator('.community-reviews')
  const card = owner => section.getByRole('article', { name: `Review by fixture_${owner}`, exact: true })
  const editor = () => section.getByRole('textbox', { name: 'Your review', exact: true })
  const publish = () => section.getByRole('button', { name: 'Publish review', exact: true })
  const edit = () => section.getByRole('button', { name: 'Edit your review', exact: true })
  const login = async email => {
    await page.goto(`${base}/login`); await page.getByLabel('Email address', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill('Test-only-password-24!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(url => !url.pathname.endsWith('/login')); await page.goto(`${base}/movies/550`); await section.getByRole('button', { name: /Write a review|Edit your review/ }).waitFor()
  }
  const logout = async () => { const response = page.waitForResponse(r => r.url().endsWith('/auth/logout') && r.status() === 204); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await response }
  await page.goto(`${base}/movies/550`); await card(8).waitFor()
  assert(!await section.getByText(a.body, { exact: true }).count(), 'Concealed spoiler was in the DOM')
  assert(!(await section.ariaSnapshot()).includes(a.body), 'Concealed spoiler was in the accessibility tree')
  await card(8).getByRole('button', { name: 'Reveal review', exact: true }).focus(); await page.keyboard.press('Enter')
  await card(8).getByText(a.body, { exact: true }).waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert(await card(8).locator('.review-reveal').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Spoiler reveal ignores reduced motion')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert(!await card(9).getByText(b.body, { exact: true }).count(), 'Revealing one spoiler revealed another')
  await card(8).getByRole('button', { name: 'Hide spoiler', exact: true }).click()
  assert(!await section.getByText(a.body, { exact: true }).count(), 'Hide did not remove spoiler text')
  await section.getByRole('link', { name: 'Sign in to write a review', exact: true }).click(); await page.waitForURL('**/login')
  await login('fan@example.test')
  await section.getByRole('button', { name: 'Write a review', exact: true }).click()
  await publish().click(); await section.getByText('Write at least one character.', { exact: true }).waitFor()
  await editor().fill('x'.repeat(5001)); assert(await publish().isDisabled(), 'Oversized review was not blocked')
  await editor().fill('🎬'.repeat(5000)); assert(!await publish().isDisabled(), 'Unicode characters were counted as UTF-16 units')
  await editor().fill('My hidden first review.'); await section.getByRole('checkbox', { name: 'My review contains spoilers', exact: true }).check()
  failure = 'create'; await publish().click(); await section.getByRole('alert').filter({ hasText: 'server could not' }).waitFor()
  assert(await editor().inputValue() === 'My hidden first review.' && await section.getByRole('checkbox').isChecked(), 'Failure lost draft/spoiler state')
  failure = ''; delayed = true; await publish().click(); await page.waitForFunction(() => document.querySelector('.review-editor')?.getAttribute('aria-busy') === 'true')
  assert(await publish().count() === 0 || await section.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), 'Pending publish enabled')
  assert(!ownReview(7), 'Pending review was prematurely committed')
  delayed = false; release(); await section.getByText('Your review is published.', { exact: true }).waitFor()
  const id = ownReview(7).id, created = ownReview(7).created_at
  assert(!await card(7).getByText('My hidden first review.', { exact: true }).count(), 'New spoiler did not start concealed')
  await card(7).getByRole('button', { name: 'Reveal review', exact: true }).click()
  await edit().click(); await editor().fill('Changed hidden review.'); await section.getByRole('button', { name: 'Save changes', exact: true }).click()
  await section.getByText('Your review was updated.', { exact: true }).waitFor()
  assert(!await card(7).getByText('Changed hidden review.', { exact: true }).count(), 'Editing did not reset spoiler disclosure')
  await edit().click(); const malicious = '<img src=x onerror="window.__reviewXss=1">\n<script>window.__reviewXss=2</script>\n' + 'Longword'.repeat(150)
  await editor().fill(malicious); await section.getByRole('checkbox').uncheck(); failure = 'edit'; await section.getByRole('button', { name: 'Save changes', exact: true }).click()
  await section.getByRole('alert').waitFor(); assert(await editor().inputValue() === malicious, 'Failed edit lost text')
  failure = ''; await section.getByRole('button', { name: 'Save changes', exact: true }).click(); await section.getByText('Your review was updated.', { exact: true }).waitFor()
  await card(7).getByRole('button', { name: 'Read full review', exact: true }).click(); await card(7).getByText(malicious, { exact: true }).waitFor()
  assert(await card(7).locator('img, script').count() === 0 && await page.evaluate(() => window.__reviewXss) === undefined, 'Review markup executed')
  assert(ownReview(7).id === id && ownReview(7).created_at === created, 'Edit changed identity/creation time')
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await section.scrollIntoViewIfNeeded()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reviews overflow ${width}`)
    if (screenshots) await section.screenshot({ path: `${screenshots}/reviews-${width}.png`, style: '.app-header { visibility: hidden !important }' })
    await edit().click(); if (screenshots) await section.locator('.review-editor').screenshot({ path: `${screenshots}/editor-${width}.png`, style: '.app-header { visibility: hidden !important }' }); await section.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  await section.getByRole('button', { name: 'Delete your review', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Keep review', exact: true }).waitFor()
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); if (screenshots) await page.getByRole('dialog').screenshot({ path: `${screenshots}/delete-${width}.png`, animations: 'disabled' }); assert(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), `Delete dialog overflow ${width}`) }
  await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).focus(); await page.keyboard.press('Tab')
  assert(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), 'Native delete dialog lost focus containment')
  await page.keyboard.press('Escape'); assert(await section.getByRole('button', { name: 'Delete your review', exact: true }).evaluate(el => el === document.activeElement), 'Dialog did not restore trigger focus')
  await section.getByRole('button', { name: 'Delete your review', exact: true }).click(); failure = 'delete'; await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click()
  await page.getByRole('dialog').getByRole('alert').waitFor(); assert(ownReview(7), 'Failed deletion removed review')
  failure = ''; delayed = true; await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('dialog[open]')?.getAttribute('aria-busy') === 'true')
  await page.keyboard.press('Escape'); await page.keyboard.press('Tab')
  assert(ownReview(7) && await page.getByRole('dialog').evaluate(el => el.open && el.contains(document.activeElement)), 'Pending deletion lost confirmation state or keyboard containment')
  delayed = false; release(); await section.getByText('Your review was deleted.', { exact: true }).waitFor()
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); await editor().fill('Preserve this conflicting draft.'); conflict = true; await publish().click()
  await section.getByRole('button', { name: 'Open existing review to edit', exact: true }).waitFor()
  assert(await editor().inputValue() === 'Preserve this conflicting draft.', '409 discarded draft')
  const patchesBefore = requests.filter(r => r.method === 'PATCH').length
  await section.getByRole('button', { name: 'Open existing review to edit', exact: true }).click(); assert(await editor().inputValue() === 'Saved in another tab.', 'Explicit edit did not load existing body')
  assert(requests.filter(r => r.method === 'PATCH').length === patchesBefore, '409 automatically submitted PATCH')
  await section.getByRole('button', { name: 'Cancel', exact: true }).click()
  await section.getByRole('button', { name: 'Delete your review', exact: true }).click()
  reviews.delete(ownReview(7).id)
  await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click()
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'no longer available' }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.waitForFunction(() => document.activeElement?.textContent === 'Write a review')
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); await editor().fill('User A review after external deletion.'); await publish().click(); await section.getByText('Your review is published.', { exact: true }).waitFor()
  checks.push('Guest reveal/hide/accessibility; invalid/Unicode editor; draft/pending/error states; create/edit/spoiler reset; escaped markup/read-more; responsive cards/editor; delete cancel/failure/success/focus; preserved 409 draft and explicit edit')
  for (let i = 0; i < 24; i++) add(100 + i, `Pagination review ${i}`, false, '2026-11-05T00:00:00Z')
  await page.reload(); await section.getByRole('button', { name: 'Next reviews', exact: true }).waitFor(); await section.getByRole('button', { name: 'Next reviews', exact: true }).click(); await section.getByText('Page 2 of 2', { exact: true }).waitFor()
  await section.getByRole('button', { name: 'Previous reviews', exact: true }).click(); await section.getByText('Page 1 of 2', { exact: true }).waitFor()
  listFailure = true; await page.reload(); await section.getByRole('button', { name: 'Retry community reviews', exact: true }).waitFor(); listFailure = false; await section.getByRole('button', { name: 'Retry community reviews', exact: true }).click(); await section.getByRole('article').first().waitFor()
  ownFailure = true; await page.reload(); await section.getByRole('button', { name: 'Retry your review', exact: true }).waitFor(); ownFailure = false; await section.getByRole('button', { name: 'Retry your review', exact: true }).click(); await edit().waitFor()
  assert(await page.locator('.community-ratings').getByRole('radio', { name: '4 stars', exact: true }).isChecked(), 'Review operations changed rating')
  assert(await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).count() === 1 && await page.getByRole('button', { name: 'Remove from Watched', exact: true }).count() === 1, 'Review changed library membership')
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click(); assert(await page.getByRole('checkbox').isChecked(), 'Review changed collection membership'); await page.keyboard.press('Escape')
  await logout(); await login('other@example.test'); await edit().click(); assert(await editor().inputValue() === a.body, 'Other account inherited personal review/draft')
  outage = true; await editor().fill('Existing review edited without Catalog.'); await section.getByRole('button', { name: 'Save changes', exact: true }).click(); await section.getByText('Your review was updated.', { exact: true }).waitFor()
  await section.getByRole('button', { name: 'Delete your review', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click(); await section.getByText('Your review was deleted.', { exact: true }).waitFor()
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); await editor().fill('New review during outage.'); await publish().click(); await section.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor()
  assert(await editor().inputValue() === 'New review during outage.' && !ownReview(8), 'Outage lost draft or fabricated success')
  await page.emulateMedia({ reducedMotion: 'reduce' }); assert(await section.locator('.review-editor').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Editor ignores reduced motion')
  auth = user(99); await page.reload(); await page.waitForURL('**/verify-email')
  checks.push('Bounded pagination/list and private retries; rating/library/collection independence; account isolation; existing edits/deletes and new-review failure during outage; reduced motion; unverified guard')
  assert(errors.length === 0, errors.join('\n'))
  return { checks, requests: requests.length, errors }
}
