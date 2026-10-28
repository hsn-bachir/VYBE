// Isolated Playwright acceptance checks. No fixture is used by the application.
// Import and call runMovieDiscoveryChecks(page) from a Playwright runner or MCP.
export async function runMovieDiscoveryChecks(page, base = 'http://127.0.0.1:5173') {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const checks = []
  const record = (label) => checks.push(label)
  const requests = []
  let popularMode = 'normal'
  let authMode = 'guest'
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' }
  const fixture = (id = 42) => ({ tmdb_id: id, title: id === 42 ? 'The Quiet Horizon' : 'Test film ' + id,
    overview: 'Isolated browser acceptance fixture. Production pages always request the Core API.',
    poster_path: id === 44 ? null : '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    backdrop_path: '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg', release_date: '2025-01-02', tmdb_rating: 8.4, tmdb_vote_count: 1200 })
  await page.unroute('**/api/v1/**')
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/me')) return authMode === 'guest'
      ? route.fulfill({ status: 401, headers, json: { message: 'Unauthenticated.' } })
      : route.fulfill({ headers, json: { data: { id: 1, username: 'test_fan', email: 'fan@example.test', avatar_url: null, email_verified_at: authMode === 'verified' ? '2026-10-28T00:00:00Z' : null } } })
    requests.push(url)
    if (url.pathname.endsWith('/popular') && popularMode === 'error') return route.fulfill({ status: 503, headers, json: { code: 'UPSTREAM_UNAVAILABLE' } })
    if (/\/movies\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/').at(-1))
      if (id === 404) return route.fulfill({ status: 404, headers, json: { code: 'MOVIE_NOT_FOUND' } })
      if (id === 999) return route.fulfill({ status: 503, headers, json: { code: 'UPSTREAM_UNAVAILABLE' } })
      return route.fulfill({ headers, json: { data: { ...fixture(id), overview: id === 43 ? null : fixture(id).overview, original_title: null, runtime: id === 43 ? null : 120, original_language: id === 43 ? null : 'en', genres: id === 43 ? [] : [{ id: 18, name: 'Drama' }] }, meta: { stale: true } } })
    }
    const currentPage = Number(url.searchParams.get('page') || 1)
    if (url.pathname.endsWith('/popular')) await new Promise(resolve => setTimeout(resolve, 500))
    return route.fulfill({ headers, json: { data: url.searchParams.get('query') === 'nomatch' || popularMode === 'empty' ? [] : Array.from({ length: 12 }, (_, i) => fixture(42 + i)), meta: { page: currentPage, total_pages: 3, total_results: 60 } } })
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(base)
  await page.getByLabel('Loading movies', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).waitFor()
  record('Guest popular loading, hero and cards')
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).click()
  await page.getByText('A saved edition.', { exact: false }).waitFor()
  assert(await page.locator('.detail-copy h1').textContent() === 'The Quiet Horizon', 'Detail navigation failed')
  await page.getByRole('link', { name: 'Back to discovery' }).click()
  assert(new URL(page.url()).pathname === '/', 'Detail return context lost')
  record('Card navigation and contextual return')
  await page.getByRole('link', { name: 'Discover', exact: false }).first().click()
  await page.getByRole('heading', { name: 'Movies worth discovering.' }).waitFor()
  const start = requests.length
  await page.getByRole('searchbox').fill('test')
  await page.waitForTimeout(180)
  assert(requests.length === start, 'Search requested before debounce')
  await page.getByRole('searchbox').fill('test film')
  await page.waitForURL(url => url.searchParams.get('query') === 'test film')
  await page.getByRole('heading', { name: 'Results for “test film”' }).waitFor()
  assert(requests.filter(url => url.pathname.endsWith('/search')).length === 1, 'Search debounce did not coalesce edits')
  record('350ms debounce, URL-backed search and no empty-query fetch')
  await page.getByRole('link', { name: 'Next page' }).click()
  await page.waitForURL(url => url.searchParams.get('page') === '2')
  assert(await page.getByRole('searchbox').inputValue() === 'test film', 'Pagination lost search')
  await page.goBack()
  await page.waitForURL(url => !url.searchParams.has('page') && url.searchParams.get('query') === 'test film')
  await page.goForward()
  await page.waitForURL(url => url.searchParams.get('page') === '2')
  record('Search pagination and browser back/forward')
  await page.getByRole('searchbox').fill('nomatch')
  await page.getByRole('heading', { name: 'No matches. More possibilities.' }).waitFor()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await page.getByRole('heading', { name: 'Movies worth discovering.' }).waitFor()
  record('No-results and search clear')
  await page.goto(base + '/movies/404')
  await page.getByRole('heading', { name: 'This film is out of frame.' }).waitFor()
  await page.goto(base + '/movies/999')
  await page.getByRole('button', { name: 'Try again' }).waitFor()
  await page.goto(base + '/movies/43')
  await page.getByText('An overview isn’t available', { exact: false }).waitFor()
  assert(await page.getByText('Not available', { exact: true }).count() >= 2, 'Missing detail metadata failed')
  record('Detail 404, unavailable, missing metadata and stale notice')
  await page.route('**/image.tmdb.org/**', route => route.abort())
  await page.goto(base + '/movies/42')
  await page.getByRole('img', { name: 'Poster unavailable for The Quiet Horizon' }).waitFor()
  record('Image load failure fallback')
  await page.unroute('**/image.tmdb.org/**')
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 })
    for (const route of ['/', '/discover?query=test+film', '/movies/42']) {
      await page.goto(base + route)
      await page.locator(route === '/' ? '.movie-grid .movie-card' : route.startsWith('/discover') ? '.movie-card' : '.detail-copy h1').first().waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow: ' + width + ' ' + route)
    }
  }
  record('Home/search/details responsive overflow checks at 360, 768, 1024, 1440')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(base + '/movies/42')
  await page.locator('.detail-copy h1').waitFor()
  assert(await page.locator('.detail-copy').evaluate(el => getComputedStyle(el).opacity === '1' && getComputedStyle(el).transform === 'none'), 'Reduced motion not honored')
  record('Reduced-motion content reveal disabled')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  popularMode = 'error'
  await page.goto(base)
  await page.getByRole('button', { name: 'Try again' }).waitFor()
  popularMode = 'normal'
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).waitFor()
  record('Popular error and working retry')
  popularMode = 'empty'
  await page.goto(base)
  await page.getByRole('heading', { name: 'Nothing in this frame yet.' }).waitFor()
  popularMode = 'normal'
  await page.goto(base + '/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
  record('Login route remains available to guests')
  authMode = 'unverified'
  await page.goto(base)
  await page.waitForURL('**/verify-email')
  await page.getByText('fan@example.test', { exact: false }).first().waitFor()
  record('Unverified account redirected without loop')
  authMode = 'verified'
  await page.goto(base + '/login')
  await page.waitForURL(base + '/')
  await page.getByRole('link', { name: 'View The Quiet Horizon' }).waitFor()
  record('Verified account keeps movie access')
  await page.unroute('**/api/v1/**')
  return { passed: checks.length, checks }
}
