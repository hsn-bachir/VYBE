// Browser fixture for administration layout and interactions. No developer data is changed.
export async function runAdminChecks(page, base, screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }
  const time = '2026-11-05T12:00:00Z'
  const actor = { id: 5, username: 'operator', email: 'operator@example.test', avatar_url: null, email_verified_at: time }
  const user = { id: 9, username: 'cine_fan', email: 'fan@example.test', role: 'user', account_status: 'active',
    email_verified_at: time, invitation_pending: false, created_at: time, updated_at: time }
  let spoiler = false
  let role = 'admin'
  let insightsState = 'ready'
  let insightsRequests = 0
  let insightsDelay
  const movies = [
    { title: 'The Quiet Horizon', poster_path: '/horizon.jpg', release_date: '2025-01-01' },
    { title: 'After the Last Train', poster_path: '/last-train.jpg', release_date: '2024-02-09' },
    { title: 'An Unusually Long Movie Title for Checking That the Ranking Rows Stay Readable', poster_path: '/long-title.jpg', release_date: null },
    { title: 'Midnight Signals', poster_path: '/signals.jpg', release_date: '2023-07-15' },
    null,
  ]
  const insights = {
    most_watched: movies.map((movie, index) => ({ tmdb_id: 550 + index, movie, watched_users: 49 - 12 * index })),
    highest_rated: [1, 0, 3, 4].map((index, rank) => ({ tmdb_id: 550 + index, movie: movies[index], average_rating: 4.85 - .1 * rank, rating_count: 38 - 7 * rank })),
  }
  const review = () => ({ id: 4, tmdb_id: 550, author: { id: 9, username: 'cine_fan' }, body: 'An interesting movie with a memorable ending.',
    body_preview: 'An interesting movie with a memorable ending.', visibility: 'visible', author_contains_spoilers: false,
    moderator_spoiler: spoiler, contains_spoilers: spoiler, pending_report_count: 1, created_at: time, updated_at: time })
  const report = () => ({ id: 3, target_type: 'review', target_id: 4, reason: 'spoiler', description: 'The ending is described.',
    status: 'pending', reporter: { id: 10, username: 'reader' }, target_available: true, review: review(),
    resolved_by: null, resolved_at: null, resolution_note: null, resolution_action: null, created_at: time, updated_at: time })
  const meta = { page: 1, per_page: 20, total_pages: 1, total_results: 1 }
  await page.route('https://image.tmdb.org/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const color = { 'horizon.jpg': '#7753ad', 'last-train.jpg': '#406582', 'long-title.jpg': '#873b57', 'signals.jpg': '#477d6e' }[name] ?? '#38304d'
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 60"><path fill="${color}" d="M0 0h40v60H0z"/><circle fill="#f8f7ff" fill-opacity=".65" cx="24" cy="19" r="9"/><path fill="#14101d" fill-opacity=".7" d="M0 52l12-17 8 5 20-15v35H0z"/></svg>` })
  })
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const reply = (body, status = 200) => route.fulfill({ status, headers, json: body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/auth/me') return reply({ data: actor })
    if (path === '/api/v1/me/access') return reply({ data: { role, account_status: 'active' } })
    if (path === '/api/v1/admin/overview') return reply({ data: { pending_reports: 1, handled_reports: 2,
      hidden_reviews: 0, enforced_spoilers: spoiler ? 1 : 0, recent_reports: [{ id: 3, review_id: 4, reason: 'spoiler', status: 'pending', created_at: time }],
      ...(role === 'admin' ? { users: { total: 10, restricted: 1, banned: 0, deactivated: 0 },
        activity: { total_reviews: 26, total_ratings: 148, total_watched_entries: 247 } } : {}) } })
    if (path === '/api/v1/admin/movie-insights') {
      insightsRequests++
      if (insightsDelay) await insightsDelay
      if (role !== 'admin') return reply({ message: 'Forbidden.' }, 403)
      if (insightsState === 'error') return reply({ message: 'Unable to load movie insights.' }, 500)
      const outage = insightsState === 'outage'
      const data = insightsState === 'empty' ? { most_watched: [], highest_rated: [] }
        : outage ? { most_watched: insights.most_watched.map(row => ({ ...row, movie: null })),
          highest_rated: insights.highest_rated.map(row => ({ ...row, movie: null })) } : insights
      return reply({ data, meta: { metadata_unavailable: outage } })
    }
    if (path === '/api/v1/admin/users') return reply({ data: [user], meta })
    if (path === '/api/v1/admin/users/9') return reply({ data: user })
    if (path === '/api/v1/admin/actions') return reply({ data: [{ id: 1, actor: { id: 5, username: 'operator' }, action: 'review.spoiler_set',
      target_type: 'review', target_id: 4, reason: null, details: { tmdb_id: 550 }, created_at: time }], meta })
    if (path === '/api/v1/admin/reports') return reply({ data: [report()], meta })
    if (path === '/api/v1/admin/reports/3') return reply({ data: report() })
    if (path === '/api/v1/admin/reviews') return reply({ data: [{ ...review(), body: undefined }], meta })
    if (path === '/api/v1/admin/reviews/4') return reply({ data: review() })
    if (path === '/api/v1/admin/movie-summaries') return reply({ data: [{ tmdb_id: 550, title: 'The Quiet Horizon', overview: null,
      poster_path: null, backdrop_path: null, release_date: '2025-01-01', tmdb_rating: null, tmdb_vote_count: null }],
      meta: { requested_count: 1, returned_count: 1, missing_tmdb_ids: [] } })
    if (path === '/api/v1/movies/search') return reply({ data: [{ tmdb_id: 550, title: 'The Quiet Horizon', overview: null,
      poster_path: null, backdrop_path: null, release_date: '2025-01-01', tmdb_rating: null, tmdb_vote_count: null }],
      meta: { page: 1, total_pages: 1, total_results: 1 } })
    if (path === '/api/v1/admin/reviews/4/spoiler' && method === 'PUT') { spoiler = request.postDataJSON().moderator_spoiler; return reply({ data: review() }) }
    return reply({ message: 'Unmocked fixture path' }, 501)
  })
  const routes = [
    ['/admin', 'Administration'], ['/admin/users', 'User Management'], ['/admin/users/9', 'cine_fan'],
    ['/admin/reports', 'Reports'], ['/admin/reports/3', 'Investigate report'],
    ['/admin/reviews', 'Review management'], ['/admin/actions', 'Action history'],
  ]
  const widths = [390, 768, 1024, 1440]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    for (const [path, heading] of routes) {
      await page.goto(`${base}${path}`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      if (path === '/admin') await page.getByText('Total watched entries').waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflows at ${width}px`)
      if (screenshots && (path === '/admin' || path === '/admin/reviews')) {
        await page.screenshot({ path: `${screenshots}/admin-${path.replaceAll('/', '-') || 'root'}-${width}.png`, fullPage: true })
      }
    }
    assert(await page.locator('.admin-mobile-menu').isVisible() === (width < 900), `Mobile menu state at ${width}px`)
    await page.goto(`${base}/admin`)
    await page.getByText('Total VYBE ratings').waitFor()
    assert(await page.evaluate(() => {
      const grid = document.querySelector('.admin-platform-totals .admin-stats').getBoundingClientRect()
      const cards = [...document.querySelectorAll('.admin-platform-totals .admin-stat')].map(card => card.getBoundingClientRect())
      return cards.length === 4 && cards.every(({ left, right, width }, index) => left >= grid.left && right <= grid.right
        && Math.abs(width - cards[0].width) < 1 && cards.slice(index + 1).every(next => next.left >= right || next.top >= cards[index].bottom))
    }), `KPI cards overflow or overlap at ${width}px`)
    const mobile = width < 900
    const menu = page.locator('.admin-mobile-menu')
    if (mobile) {
      assert(!await menu.evaluate(element => element.open), `Mobile menu should start collapsed at ${width}px`)
      await menu.locator('summary').click()
      await page.getByRole('navigation', { name: 'Administration mobile' }).waitFor()
      assert(await page.evaluate(() => {
        const { bottom } = document.querySelector('.admin-mobile-menu').getBoundingClientRect()
        return bottom <= document.querySelector('.admin-main').getBoundingClientRect().top
      }), `Expanded mobile menu overlaps the content at ${width}px`)
      if (screenshots) await page.screenshot({ path: `${screenshots}/admin-mobile-menu-open-${width}.png`, fullPage: true })
    }
    const nav = page.getByRole('navigation', { name: mobile ? 'Administration mobile' : 'Administration', exact: true })
    await nav.getByRole('link', { name: 'Movie Insights' }).click()
    await page.getByRole('heading', { name: 'Movie Insights', exact: true }).waitFor()
    await page.getByRole('region', { name: 'Most Watched Movies' }).getByRole('link', { name: 'The Quiet Horizon' }).waitFor()
    if (mobile) assert(!await menu.evaluate(element => element.open), `Mobile menu should close after navigation at ${width}px`)
    else assert(await nav.getByRole('link', { name: 'Movie Insights' }).getAttribute('aria-current') === 'page', 'Movie Insights should be active in the sidebar')
    const layout = await page.evaluate(() => {
      const rect = element => element.getBoundingClientRect()
      const main = rect(document.querySelector('.admin-main'))
      const grid = rect(document.querySelector('.admin-insights-grid'))
      const panels = [...document.querySelectorAll('.admin-ranking')].map(rect)
      const rows = [...document.querySelectorAll('.admin-ranked-list li')]
      const overlap = (a, b) => a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1
      return document.documentElement.scrollWidth <= innerWidth && Math.abs(main.width - grid.width) < 1
        && !overlap(panels[0], panels[1]) && rows.every(row => {
          const [position, poster, title, metric] = [...row.children].map(rect)
          return poster.width === 40 && poster.height === 60 && position.right <= poster.left && poster.right <= title.left && title.right <= metric.left
        })
    })
    assert(layout, `Ranking layout, panel spacing or poster dimensions failed at ${width}px`)
    if (screenshots) await page.screenshot({ path: `${screenshots}/admin-movie-insights-${width}.png`, fullPage: true })
  }

  insightsState = 'empty'
  let releaseInsights
  insightsDelay = new Promise(resolve => { releaseInsights = resolve })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`${base}/admin/movie-insights`)
  await page.getByRole('status', { name: 'Loading most watched movies' }).waitFor()
  await page.getByRole('status', { name: 'Loading highest rated movies' }).waitFor()
  assert(await page.locator('.admin-ranking-skeleton').first().evaluate(element =>
    getComputedStyle(element).backgroundColor !== getComputedStyle(element.closest('.admin-ranking')).backgroundColor),
  'Ranking placeholders should be visible against their panel')
  if (screenshots) await page.screenshot({ path: `${screenshots}/admin-movie-insights-loading.png`, fullPage: true })
  insightsDelay = undefined
  releaseInsights()
  await page.getByText('No movies have been marked as watched yet.').waitFor()
  await page.getByText('No VYBE community ratings yet.').waitFor()
  if (screenshots) await page.screenshot({ path: `${screenshots}/admin-movie-insights-empty.png`, fullPage: true })

  insightsState = 'error'
  await page.reload()
  await page.getByRole('alert').waitFor()
  insightsState = 'outage'
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByText('Movie details are temporarily unavailable.', { exact: false }).waitFor()
  const watched = page.getByRole('region', { name: 'Most Watched Movies' })
  await watched.getByRole('link', { name: 'Movie #550' }).waitFor()
  await watched.getByText('49', { exact: true }).waitFor()
  insightsState = 'ready'
  await page.getByRole('button', { name: 'Retry movie details' }).click()
  await watched.getByRole('link', { name: 'The Quiet Horizon' }).waitFor()
  assert(await watched.getByRole('link', { name: 'The Quiet Horizon' }).getAttribute('href') === '/movies/550', 'Movie link targets the Core-backed detail route')

  role = 'moderator'
  const requestsBeforeDenial = insightsRequests
  await page.reload()
  await page.getByRole('heading', { name: 'Access denied' }).waitFor()
  assert(insightsRequests === requestsBeforeDenial, 'Moderator requested administrator-only rankings')
  await page.goto(`${base}/admin`)
  await page.getByRole('heading', { name: 'Moderation overview' }).waitFor()
  await page.getByText('Pending reports').waitFor()
  assert(await page.locator('a[href="/admin/movie-insights"]').count() === 0, 'Moderator has a movie insights navigation item')
  assert(await page.getByText('Total VYBE ratings').count() === 0, 'Moderator can read administrator totals')

  role = 'admin'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${base}/admin/reviews`)
  await page.getByRole('heading', { name: 'Review management' }).waitFor()
  await page.getByText('The Quiet Horizon').first().waitFor()
  assert(await page.locator('.admin-table tbody tr').count() === 1, 'Review table did not render one compact row')
  await page.getByRole('button', { name: 'Actioned', exact: true }).click()
  await page.getByLabel('Moderation state').waitFor()
  await page.getByRole('button', { name: 'All Reviews', exact: true }).click()
  await page.getByLabel('Search movies by title').fill('Quiet')
  await page.getByRole('button', { name: /The Quiet Horizon.*2025/ }).waitFor()
  await page.getByRole('button', { name: /The Quiet Horizon.*2025/ }).click()
  await page.waitForURL('**/admin/reviews?*tmdb_id=550*')
  await page.locator('.admin-action-menu summary').click()
  await page.getByRole('button', { name: 'Mark as spoiler' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  assert(!await dialog.getByLabel('Reason for this decision').count(), 'Routine spoiler action asks for a reason')
  await dialog.getByRole('button', { name: 'Confirm change' }).click()
  await page.getByText('Review moderation change saved.').waitFor()
  await page.locator('.admin-action-menu summary').click()
  await page.getByRole('button', { name: 'Hide review' }).click()
  await dialog.getByLabel('Reason for this decision').waitFor()
  await page.keyboard.press('Escape')
  assert(errors.length === 0, errors.join('\n'))
  return { checkedRoutes: routes.length + 1, widths, errors }
}
