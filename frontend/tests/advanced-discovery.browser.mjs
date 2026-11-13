// Isolated acceptance checks: API and poster responses are intercepted in this page only.
export async function runAdvancedDiscoveryChecks(page, base = 'http://localhost:5173') {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const checks = []
  const requests = []
  let upcomingMode = 'delayed'
  let releaseUpcoming
  const gate = new Promise(resolve => { releaseUpcoming = resolve })
  const fixture = (id, upcoming = false) => ({ tmdb_id: id, title: `${upcoming ? 'Upcoming' : 'Popular'} fixture ${id}`, overview: 'Isolated acceptance fixture.', poster_path: '/fixture.jpg', backdrop_path: '/fixture.jpg', release_date: upcoming ? '2099-12-10' : '2020-01-01', tmdb_rating: 8, tmdb_vote_count: 400 })
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' }
  await page.unroute('**/api/v1/**')
  await page.route('https://image.tmdb.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#171B24"/></svg>' }))
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ status: 401, headers, json: { message: 'Unauthenticated.' } })
    requests.push(url)
    const upcoming = url.searchParams.get('category') === 'upcoming'
    if (upcoming && upcomingMode === 'delayed') await gate
    if (upcoming && upcomingMode === 'error') return route.fulfill({ status: 503, headers, json: { code: 'UPSTREAM_UNAVAILABLE' } })
    const currentPage = Number(url.searchParams.get('page') ?? 1)
    const rows = upcoming && upcomingMode === 'empty' ? [] : Array.from({ length: 12 }, (_, i) => fixture((upcoming ? 100 : 1) + i + (currentPage - 1) * 20, upcoming))
    return route.fulfill({ headers, json: { data: rows, meta: { page: currentPage, total_pages: 3, total_results: 36 } } })
  })
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(base)
    await page.locator('.popular-section .movie-card').first().waitFor()
    assert(await page.getByLabel('Loading upcoming movies', { exact: true }).count() === 1, 'Upcoming blocked Popular or did not show its own skeleton')
    upcomingMode = 'normal'
    releaseUpcoming()
    await page.locator('.upcoming-section .movie-card').first().waitFor()
    assert(await page.locator('.upcoming-section .movie-card').count() === 6, 'Home must show six upcoming cards')
    assert(await page.locator('.upcoming-section time').count() === 6, 'Missing upcoming dates')
    assert(await page.locator('.spotlight + .upcoming-section').count() === 1 || await page.locator('.upcoming-section + .popular-section').count() === 1, 'Incorrect Home section order')
    checks.push('Home loads Popular independently and shows six upcoming cards with dates')
    const upcomingCount = () => requests.filter(url => url.searchParams.get('category') === 'upcoming').length
    const before = upcomingCount()
    await page.getByRole('link', { name: 'Explore Upcoming' }).click()
    await page.getByRole('heading', { name: 'Coming Soon' }).waitFor()
    assert(await page.locator('.discovery-categories a[aria-current="page"]').textContent() === 'Upcoming', 'Upcoming category not selected')
    assert(await page.locator('.discover-results .movie-card').count() === 12, 'Discover did not reuse the full first page')
    assert(upcomingCount() === before, 'Explore Upcoming refetched fresh shared data')
    checks.push('Explore Upcoming selects the category and reuses the shared query cache')
    await page.getByLabel('Sort by', { exact: true }).selectOption('title.asc')
    await page.locator('.discovery-filter-panel summary').click()
    await page.getByLabel('Drama', { exact: true }).check()
    await page.getByLabel('Comedy', { exact: true }).check()
    await page.getByLabel('Match genres', { exact: true }).selectOption('all')
    await page.getByLabel('From year', { exact: true }).fill('2026')
    await page.getByLabel('To year', { exact: true }).fill('2099')
    await page.getByLabel('Minimum TMDB rating').fill('7.5')
    await page.getByLabel('Runtime from', { exact: true }).fill('90')
    await page.getByLabel('Runtime to', { exact: true }).fill('180')
    await page.getByLabel('Original language', { exact: true }).selectOption('fr')
    const appliedRequest = page.waitForRequest(request => {
      const url = new URL(request.url())
      return url.pathname.endsWith('/movies/discover') && url.searchParams.get('sort') === 'title.asc' && url.searchParams.get('original_language') === 'fr'
    })
    await page.getByRole('button', { name: 'Show results', exact: true }).click()
    await page.waitForURL('**genre_match=all**')
    const combined = new URL((await appliedRequest).url())
    await page.locator('.discover-results .movie-card').first().waitFor()
    assert(combined.searchParams.get('sort') === 'title.asc' && combined.searchParams.get('original_language') === 'fr', 'Combined filter request missing values')
    assert(combined.searchParams.get('genres[]') === '18' || combined.searchParams.get('genres[0]') === '18', 'Genre IDs were not canonicalized')
    await page.getByRole('link', { name: 'Next page', exact: false }).click()
    await page.waitForURL('**page=2')
    await page.locator('.discover-results .movie-card').first().waitFor()
    assert(new URL(page.url()).searchParams.get('runtime_max') === '180', 'Pagination lost filters')
    await page.goBack()
    await page.locator('.discover-results .movie-card').first().waitFor()
    assert(new URL(page.url()).searchParams.get('page') === null, 'History did not restore page one')
    assert(await page.getByLabel('From year', { exact: true }).inputValue() === '2026', 'History did not restore form values')
    await page.goForward()
    await page.waitForURL('**page=2')
    await page.locator('.discover-results .movie-card').first().waitFor()
    await page.goBack()
    await page.waitForURL(url => !url.searchParams.has('page'))
    await page.getByRole('button', { name: 'Remove Drama filter', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('genres') === '35')
    await page.getByRole('link', { name: 'Clear all', exact: true }).last().click()
    await page.waitForURL('**category=upcoming')
    checks.push('Combined filters, ALL genres, global sort, pagination, history, chips and reset')
    await page.getByRole('link', { name: 'Trending', exact: true }).click()
    await page.getByRole('heading', { name: 'Trending This Week' }).waitFor()
    assert(await page.getByLabel('Sort by', { exact: true }).count() === 0, 'Trending misleadingly exposed unsupported sorting')
    await page.getByRole('searchbox', { name: 'Search movies', exact: true }).fill('space')
    await page.waitForURL('**query=space')
    await page.getByText('Browse filters do not apply', { exact: false }).waitFor()
    assert(await page.getByRole('navigation', { name: 'Browse categories' }).count() === 0, 'Search mixed in browse filters')
    checks.push('Trending limitations and search/browse separation')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base + '/discover?category=upcoming')
    await page.locator('.discover-results .movie-card').first().waitFor()
    await page.locator('.discovery-filter-panel summary').click()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile filters overflow')
    assert(await page.getByLabel('Original language', { exact: true }).isVisible(), 'Mobile filters are unusable')
    checks.push('Mobile layout fits at 390px with usable expanded filters')
    upcomingMode = 'error'
    await page.goto(base)
    await page.getByText('The next act is taking a moment.', { exact: true }).waitFor()
    assert(await page.locator('.popular-section .movie-card').count() > 0, 'Upcoming failure hid Popular')
    upcomingMode = 'normal'
    await page.locator('.upcoming-section').getByRole('button', { name: 'Try again' }).click()
    await page.locator('.upcoming-section .movie-card').first().waitFor()
    upcomingMode = 'empty'
    await page.goto(base)
    await page.getByText('The next chapter is on its way.', { exact: true }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Home overflow on mobile')
    checks.push('Upcoming error/retry and empty states preserve Popular on mobile')
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(base + '/discover?category=popular')
      await page.locator('.discover-results .movie-card').first().waitFor()
      const bounds = () => page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect()
        const section = rect('.discover-results'), toolbar = rect('.discovery-toolbar'), panel = rect('.discovery-filter-content'), card = rect('.movie-grid .movie-card')
        return { left: section.left, right: section.right, toolbarBottom: toolbar.bottom, panelLeft: panel.left, panelRight: panel.right, panelTop: panel.top, panelBottom: panel.bottom, cardTop: card.top, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      const collapsed = await bounds()
      await page.locator('.discovery-filter-panel summary').click()
      const expanded = await bounds()
      assert(Math.abs(expanded.panelLeft - expanded.left) < 2 && Math.abs(expanded.panelRight - expanded.right) < 2, `Panel does not span results at ${width}px`)
      assert(expanded.panelTop - collapsed.toolbarBottom >= 14, `Panel lacks toolbar spacing at ${width}px`)
      assert(expanded.cardTop - expanded.panelBottom >= 24, `Panel overlaps cards at ${width}px`)
      assert(collapsed.cardTop - collapsed.toolbarBottom >= 24 && expanded.cardTop > collapsed.cardTop, `Grid does not flow below filters at ${width}px`)
      assert(!collapsed.overflow && !expanded.overflow, `Horizontal overflow at ${width}px`)
    }
    checks.push('Expanded and collapsed filter geometry at 1440, 1024, 768 and 390 pixels')
    return checks
  } finally {
    releaseUpcoming()
    await page.unroute('**/api/v1/**')
    await page.unroute('https://image.tmdb.org/**')
  }
}
