// Stateful HTTP fixtures exercise real React interactions, not database persistence.
export async function runCollectionsChecks(page, base = 'http://127.0.0.1:5182', screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const errors = [], requests = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  let owner = 7, auth = 'verified', nextId = 1, failure = '', delayed = false, releaseWrite, outage = false, listFailure = false
  const stores = new Map()
  const store = () => { if (!stores.has(owner)) stores.set(owner, new Map()); return stores.get(owner) }
  const addCollection = (name, description = null) => {
    const c = { id: nextId++, name, description, created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z', movies: new Set() }
    store().set(c.id, c); return c
  }
  const movie = { tmdb_id: 550, title: 'The Quiet Horizon', overview: 'Synthetic movie data for browser acceptance only.', poster_path: null, backdrop_path: null, release_date: '2025-01-02', tmdb_rating: 8.4, tmdb_vote_count: 1200 }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' }
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const reply = (json, status = 200) => route.fulfill({ status, headers, json })
    const empty = () => route.fulfill({ status: 204, headers })
    if (method === 'OPTIONS') return empty()
    requests.push({ path, method, query: url.search })
    if (path.endsWith('/auth/me')) return auth === 'guest' ? reply({ message: 'Unauthenticated.' }, 401) : reply({ data: { id: owner, username: `fixture_${owner}`, email: 'fan@example.test', avatar_url: null, email_verified_at: auth === 'verified' ? '2026-11-01T00:00:00Z' : null } })
    if (path.endsWith('/auth/logout')) { auth = 'guest'; return empty() }
    if (method === 'GET' && /\/movies\/\d+\/reviews$/.test(path)) return reply({ data: [], meta: { page: 1, per_page: 20, total_pages: 0, total_results: 0 } })
    if (method === 'GET' && /\/movies\/\d+\/ratings$/.test(path)) return reply({ data: { tmdb_id: Number(path.split('/').at(-2)), average_rating: null, total_ratings: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } } })
    if (path.endsWith('/auth/login')) { auth = 'verified'; owner = 8; return reply({ data: { id: owner, username: 'fixture_8', email: 'fan@example.test', avatar_url: null, email_verified_at: '2026-11-01T00:00:00Z' } }) }
    if (path.endsWith('/experience')) return reply({ data: { tmdb_id: 550, tagline: 'Every story has a place.', trailer: null, directors: [], cast: [], related: [] }, meta: { stale: false } })
    if (path === '/api/v1/movies/550') return reply({ data: { ...movie, runtime: 125, original_title: null, original_language: 'en', genres: [] }, meta: { stale: false } })
    if (/\/movies\/(popular|search)$/.test(path)) return reply({ data: [movie], meta: { page: 1, total_pages: 1, total_results: 1 } })
    if (auth === 'guest') return reply({ message: 'Unauthenticated.' }, 401)
    if (auth !== 'verified') return reply({ message: 'Unverified.' }, 403)
    if (method === 'GET' && /\/me\/(?:reviews|ratings)\/\d+$/.test(path)) return reply({ data: null })
    if (path.endsWith('/library-state')) return reply({ data: { tmdb_id: 550, in_watchlist: true, watched_at: '2026-11-01T00:00:00Z' } })
    const match = path.match(/^\/api\/v1\/me\/collections(?:\/(\d+))?(\/movies)?(?:\/(\d+))?$/)
    if (!match) return reply({}, 404)
    const id = Number(match[1]), memberships = Boolean(match[2]), c = store().get(id)
    const dto = c => ({ id: c.id, name: c.name, description: c.description, movie_count: c.movies.size, created_at: c.created_at, updated_at: c.updated_at,
      ...(url.searchParams.has('contains_tmdb_id') ? { contains_movie: c.movies.has(Number(url.searchParams.get('contains_tmdb_id'))) } : {}) })
    if (method !== 'GET') {
      if (delayed) await new Promise(resolve => { releaseWrite = resolve })
      const kind = memberships ? 'membership' : method === 'POST' ? 'create' : method === 'PATCH' ? 'edit' : 'delete'
      if (failure === kind) return reply({ message: 'private error must not leak' }, 503)
    }
    if (!id) {
      if (method === 'POST') { const body = request.postDataJSON(); return reply({ data: dto(addCollection(body.name, body.description)) }, 201) }
      if (listFailure) return reply({}, 503)
      const p = Number(url.searchParams.get('page') || 1), rows = [...store().values()].reverse()
      return reply({ data: rows.slice((p - 1) * 20, p * 20).map(dto), meta: { page: p, per_page: 20, total_pages: Math.ceil(rows.length / 20), total_results: rows.length } })
    }
    if (!c) return reply({ message: 'Not found.' }, 404)
    if (!memberships) {
      if (method === 'DELETE') { store().delete(id); return empty() }
      if (method === 'PATCH') Object.assign(c, request.postDataJSON())
      return reply({ data: dto(c) })
    }
    if (method === 'POST') { c.movies.add(request.postDataJSON().tmdb_id); return reply({ data: { collection_id: id, tmdb_id: 550, created_at: c.created_at } }, 201) }
    if (method === 'DELETE') { c.movies.delete(Number(match[3])); return empty() }
    const p = Number(url.searchParams.get('page') || 1), rows = [...c.movies].reverse()
    return reply({ data: rows.slice((p - 1) * 20, p * 20).map(id => ({ collection_id: c.id, tmdb_id: id, created_at: c.created_at, movie: outage ? null : { ...movie, tmdb_id: id }, metadata_status: outage ? 'unavailable' : 'available' })), meta: { page: p, per_page: 20, total_pages: Math.ceil(rows.length / 20), total_results: rows.length, metadata_unavailable: outage && rows.length > 0 } })
  })
  const dialog = () => page.getByRole('dialog')
  const save = () => page.getByRole('button', { name: 'Save to collection', exact: false })
  const choice = id => page.getByRole('checkbox', { name: new RegExp(`collection ${id}$`) })
  const waitChecked = async (id, checked) => { await page.waitForFunction(({ id, checked }) => { const e = [...document.querySelectorAll('input[type=checkbox]')].find(e => e.getAttribute('aria-label')?.endsWith(`collection ${id}`)); return e && e.checked === checked && !e.disabled }, { id, checked }) }
  const shot = async name => {
    if (!screenshots) return
    const modal = page.locator('dialog[open]')
    const hasDialog = await modal.count() > 0
    if (hasDialog) await modal.evaluate(async e => { await Promise.all(e.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))) })
    await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: !hasDialog })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/movies/550`)
  await save().waitFor()
  assert(!requests.some(r => r.path.includes('collections')), 'Collections fetched before opening save')
  await save().focus(); await page.keyboard.press('Enter'); await dialog().waitFor()
  await page.getByText('No collections yet.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Create new collection', exact: false }).click()
  await page.getByRole('button', { name: 'Create & save movie', exact: true }).click()
  await page.getByText('Enter a collection name.', { exact: true }).waitFor()
  await page.getByLabel('Collection name', { exact: true }).fill('Favorites')
  failure = 'create'
  await page.getByRole('button', { name: 'Create & save movie', exact: true }).click()
  await dialog().getByRole('alert').waitFor()
  assert(await page.getByLabel('Collection name', { exact: true }).inputValue() === 'Favorites', 'Failed create discarded values')
  failure = 'membership'
  await page.getByRole('button', { name: 'Create & save movie', exact: true }).click()
  await page.getByText('Collection created, but the movie was not saved.', { exact: false }).waitFor()
  assert(store().size === 1 && !await choice(1).isChecked(), 'Create/save failure was misrepresented')
  failure = ''; delayed = true
  await choice(1).click()
  await page.waitForFunction(() => document.querySelector('input[type=checkbox]')?.disabled)
  assert(!await choice(1).isChecked(), 'Pending membership was shown as saved')
  delayed = false; releaseWrite(); await waitChecked(1, true)
  await page.getByRole('button', { name: 'Create new collection', exact: false }).click()
  await page.getByLabel('Collection name', { exact: true }).fill('Favorites')
  await page.getByRole('button', { name: 'Create & save movie', exact: true }).click()
  await waitChecked(2, true)
  assert(await choice(1).isChecked(), 'Second collection removed first membership')
  await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' })
  assert(await save().evaluate(e => e === document.activeElement), 'Save trigger focus not restored')
  await save().click(); await waitChecked(1, true); await waitChecked(2, true)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  checks.push('Invalid/create failure, create-success/save-failure, retry, pending confirmation, duplicate names, multi-save, reopen, keyboard focus')

  await page.goto(`${base}/library/collections`)
  await page.getByRole('link', { name: 'Open Favorites, collection 1', exact: true }).click()
  await page.getByRole('link', { name: 'View The Quiet Horizon', exact: true }).waitFor()
  await page.reload(); await page.getByRole('link', { name: 'View The Quiet Horizon', exact: true }).waitFor()
  failure = 'membership'
  await page.getByRole('button', { name: 'Remove The Quiet Horizon from collection', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert(store().get(1).movies.has(550), 'Failed removal changed membership')
  failure = ''
  await page.getByRole('button', { name: 'Remove The Quiet Horizon from collection', exact: true }).click()
  await page.getByRole('heading', { name: 'This collection is empty.', exact: true }).waitFor()
  assert(store().get(2).movies.has(550), 'Removal affected other collection')
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click()
  await page.getByLabel('Collection name', { exact: true }).fill('Weekend films')
  await page.getByLabel('Description', { exact: false }).fill('An edited collection')
  failure = 'edit'; await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await dialog().getByRole('alert').waitFor()
  failure = ''; await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await dialog().waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: 'Weekend films', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click(); await page.getByLabel('Description', { exact: false }).fill(''); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await dialog().waitFor({ state: 'hidden' })
  assert(store().get(1).description === null, 'Description clearing failed')
  await page.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await page.getByRole('button', { name: 'Keep collection', exact: true }).click(); assert(store().has(1), 'Cancel deleted collection')
  await page.getByRole('button', { name: 'Delete collection', exact: true }).click()
  failure = 'delete'; await dialog().getByRole('button', { name: 'Delete collection', exact: true }).click(); await dialog().getByRole('alert').waitFor()
  assert(page.url().endsWith('/1') && store().has(1), 'Failed delete navigated or removed data')
  failure = ''; await dialog().getByRole('button', { name: 'Delete collection', exact: true }).click(); await page.waitForURL(`${base}/library/collections`)
  assert(!store().has(1) && store().get(2).movies.has(550), 'Delete affected other collection')
  checks.push('Refresh, failed/successful removal, independent membership, edit failure/retry, description clearing, delete cancel/failure/success/navigation')

  const long = addCollection('A'.repeat(100), 'A long description. '.repeat(100))
  for (let i = 0; i < 22; i++) addCollection(`Collection ${i}`)
  await page.reload(); await page.getByRole('link', { name: /Open Collection 21/ }).waitFor()
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await shot(`collections-${width}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overview overflow ${width}`)
    await page.getByRole('button', { name: 'New collection', exact: false }).click(); await shot(`create-${width}`)
    assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth), `Form overflow ${width}`)
    await page.keyboard.press('Escape')
  }
  await page.getByRole('link', { name: 'Next page', exact: false }).click()
  await page.getByRole('link', { name: `Open ${long.name}, collection ${long.id}`, exact: true }).waitFor()
  await page.getByRole('link', { name: `Open ${long.name}, collection ${long.id}`, exact: true }).click()
  await page.getByRole('heading', { name: long.name, exact: true }).waitFor()
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await shot(`long-detail-${width}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Long description overflow ${width}`)
    await page.getByRole('button', { name: 'Edit collection', exact: true }).click(); await shot(`edit-${width}`)
    assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth), `Edit overflow ${width}`)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Delete collection', exact: true }).click(); await shot(`delete-${width}`)
    assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth), `Delete overflow ${width}`)
    await page.getByRole('button', { name: 'Keep collection', exact: true }).click()
  }
  await page.goto(`${base}/movies/550`); await save().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await waitChecked(2, true)
  await choice(2).click(); await waitChecked(2, false)
  await choice(2).click(); await waitChecked(2, true)
  await page.getByRole('button', { name: 'Previous', exact: true }).click(); await page.getByRole('button', { name: 'Next', exact: true }).click(); await waitChecked(2, true)
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await shot(`save-${width}`)
    assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth), `Save overflow ${width}`)
    await page.keyboard.press('Tab')
    assert(await dialog().evaluate(e => e.contains(document.activeElement)), 'Focus escaped dialog')
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert(await dialog().evaluate(e => getComputedStyle(e).animationName) === 'none', 'Reduced motion ignored')
  await page.keyboard.press('Escape')
  outage = true
  await page.goto(`${base}/library/collections/2`)
  await page.getByText('Your collection is safe', { exact: false }).waitFor()
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await shot(`collection-outage-${width}`); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Detail overflow ${width}`) }
  await page.getByRole('button', { name: 'Remove TMDB 550 from collection', exact: true }).click(); await page.getByRole('heading', { name: 'This collection is empty.', exact: true }).waitFor()
  listFailure = true; await page.goto(`${base}/library/collections`); await page.getByRole('button', { name: 'Try again' }).waitFor()
  listFailure = false; await page.getByRole('button', { name: 'Try again' }).click(); await page.getByRole('link', { name: /Open Collection 21/ }).waitFor()
  checks.push('Bounded overview/save pagination, confirmed state across pages, long text, 375/768/1440 screenshots/overflow, keyboard containment, reduced motion, outage removal, list retry')

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.goto(`${base}/library/collections`); await page.waitForURL(/\/login$/)
  await page.getByLabel('Email address', { exact: true }).fill('new@example.test'); await page.getByLabel('Password', { exact: true }).fill('Test-only-password!'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(`${base}/`)
  await page.goto(`${base}/library/collections`); await page.getByRole('button', { name: 'Create your first collection', exact: true }).waitFor()
  assert(!await page.getByRole('link', { name: /Open Collection 21/ }).count(), 'Previous owner collections visible')
  auth = 'unverified'; await page.reload(); await page.waitForURL(/\/verify-email$/)
  checks.push('Logout/private cache isolation, new account empty library, guest and unverified guards')
  assert(errors.length === 0, errors.join('\n'))
  return { checks, requests: requests.length, errors }
}
