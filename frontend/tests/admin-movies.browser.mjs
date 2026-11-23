// Isolated UI fixtures. Provider and application data are never modified.
export async function runAdminMovieChecks(page, base, screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const actor = { id: 5, username: 'operator', email: 'operator@example.test', avatar_url: null, email_verified_at: '2026-11-23T00:00:00Z' }
  const movie = { tmdb_id: 550, title: 'The Quiet Horizon', original_title: 'Original Horizon', overview: 'A locally stored cinematic journey.',
    poster_path: null, backdrop_path: null, release_date: '2024-01-03', runtime: 112, original_language: 'en', genres: null,
    tmdb_rating: 8.1, tmdb_vote_count: 500, metadata_status: 'not_hydrated', metadata_fetched_at: null }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
  let role = 'admin', state = 'active', failure = false, delay, refreshes = 0
  let lastSearch = ''
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const reply = (body, status = 200) => route.fulfill({ json: body, status, headers })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/auth/me') return reply({ data: actor })
    if (path === '/api/v1/me/access') return reply({ data: { role, account_status: state } })
    if (path === '/api/v1/admin/movies') {
      lastSearch = url.searchParams.get('q') || ''
      return reply({ data: lastSearch === 'empty' ? [] : [movie], meta: { page: Number(url.searchParams.get('page')) || 1, total_pages: 2, total_results: 21 } })
    }
    if (path === '/api/v1/admin/movies/550') return reply({ data: movie })
    if (path === '/api/v1/admin/movies/550/refresh') {
      refreshes++
      if (delay) await delay
      if (failure) return reply({ message: 'Refresh failed.' }, 503)
      movie.metadata_status = 'fresh'; movie.metadata_fetched_at = '2026-11-23T12:00:00Z'; movie.genres = [{ id: 18, name: 'Drama' }]
      return reply({ data: movie })
    }
    return reply({ message: 'Fixture path missing' }, 501)
  })
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${base}/admin/movies`)
    await page.getByRole('link', { name: movie.title, exact: true }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `List overflow ${width}`)
    if (width < 900) {
      await page.locator('.admin-mobile-menu summary').click()
      await page.getByRole('navigation', { name: 'Administration mobile' }).getByRole('link', { name: 'Movies', exact: true }).waitFor()
      await page.locator('.admin-mobile-menu summary').click()
    }
    await page.screenshot({ path: `${screenshots}/movies-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: movie.title, exact: true }).click()
    await page.getByRole('button', { name: 'Refresh from TMDB' }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Detail overflow ${width}`)
    assert(await page.locator('.admin-managed-poster').evaluate(element => Math.abs(element.getBoundingClientRect().height / element.getBoundingClientRect().width - 1.5) < .01), 'Poster aspect ratio')
    await page.screenshot({ path: `${screenshots}/movie-detail-${width}.png`, fullPage: true })
  }
  let release
  delay = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Refresh from TMDB' }).click()
  await page.getByRole('button', { name: 'Refreshing…' }).waitFor()
  assert(await page.getByRole('button', { name: 'Refreshing…' }).isDisabled(), 'Refresh pending control enabled')
  delay = undefined; release()
  await page.getByText('Metadata refreshed from TMDB.').waitFor()
  assert(refreshes === 1, 'Duplicated refresh')
  failure = true
  await page.getByRole('button', { name: 'Refresh from TMDB' }).click()
  await page.getByRole('alert').waitFor()
  assert(await page.getByText('Metadata refreshed from TMDB.').count() === 0, 'Failed refresh announced success')
  await page.getByRole('heading', { name: movie.title, exact: true }).waitFor()
  await page.goto(`${base}/admin/movies`)
  await page.getByLabel('Search title or TMDB ID').fill('550')
  const searched = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/movies' && new URL(response.url()).searchParams.get('q') === '550')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await searched
  await page.waitForURL('**q=550*')
  await page.getByRole('link', { name: movie.title, exact: true }).waitFor()
  assert(lastSearch === '550', 'Search was not sent to server')
  await page.getByLabel('Metadata health').selectOption('stale')
  await page.waitForURL('**status=stale*')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.waitForURL('**page=2*')
  await page.getByLabel('Search title or TMDB ID').fill('empty')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByText('No stored movies match these filters.').waitFor()
  state = 'restricted'
  await page.goto(`${base}/admin/movies/550`)
  await page.getByRole('button', { name: 'Refresh from TMDB' }).waitFor()
  assert(await page.getByRole('button', { name: 'Refresh from TMDB' }).isDisabled(), 'Restricted admin can refresh')
  role = 'moderator'
  await page.reload()
  await page.getByRole('heading', { name: 'Access denied' }).waitFor()
  assert(errors.length === 0, errors.join('\n'))
  return { widths: [390, 768, 1024, 1440], refreshes, errors }
}
