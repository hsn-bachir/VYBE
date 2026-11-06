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
  const review = () => ({ id: 4, tmdb_id: 550, author: { id: 9, username: 'cine_fan' }, body: 'An interesting movie with a memorable ending.',
    body_preview: 'An interesting movie with a memorable ending.', visibility: 'visible', author_contains_spoilers: false,
    moderator_spoiler: spoiler, contains_spoilers: spoiler, pending_report_count: 1, created_at: time, updated_at: time })
  const report = () => ({ id: 3, target_type: 'review', target_id: 4, reason: 'spoiler', description: 'The ending is described.',
    status: 'pending', reporter: { id: 10, username: 'reader' }, target_available: true, review: review(),
    resolved_by: null, resolved_at: null, resolution_note: null, resolution_action: null, created_at: time, updated_at: time })
  const meta = { page: 1, per_page: 20, total_pages: 1, total_results: 1 }
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const reply = (body, status = 200) => route.fulfill({ status, headers, json: body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/auth/me') return reply({ data: actor })
    if (path === '/api/v1/me/access') return reply({ data: { role: 'admin', account_status: 'active' } })
    if (path === '/api/v1/admin/overview') return reply({ data: { pending_reports: 1, handled_reports: 2,
      hidden_reviews: 0, enforced_spoilers: spoiler ? 1 : 0, recent_reports: [{ id: 3, review_id: 4, reason: 'spoiler', status: 'pending', created_at: time }],
      users: { total: 10, restricted: 1, banned: 0, deactivated: 0 } } })
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
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [path, heading] of routes) {
      await page.goto(`${base}${path}`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflows at ${width}px`)
      if (screenshots && (path === '/admin' || path === '/admin/reviews')) {
        await page.screenshot({ path: `${screenshots}/admin-${path.replaceAll('/', '-') || 'root'}-${width}.png`, fullPage: true })
      }
    }
    assert(await page.locator('.admin-mobile-menu').isVisible() === (width < 900), `Mobile menu state at ${width}px`)
  }
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
  return { checkedRoutes: routes.length, widths: [375, 768, 1440], errors }
}
