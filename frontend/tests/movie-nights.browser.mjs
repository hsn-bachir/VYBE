// Mocked Core HTTP only. No Firebase login, real accounts, database writes or provider traffic.
export async function runMovieNightDashboardChecks(page, base = 'http://127.0.0.1:5187', screenshotDirectory) {
  const checks = [], requests = [], errors = [], geometry = []
  const assert = (value, message) => { if (!value) throw new Error(message) }
  page.on('pageerror', error => errors.push(error.message))
  let account = 'active', auth = 'verified', failure = false, delay = false, owner = 7
  const host = { id: 8, username: 'cinema_friend_with_a_long_name', avatar_url: null }
  const titles = ['Friday, under the stars', 'A little cinema, a lot of company', 'The night we finally picked a film', 'One more story before the credits', 'A'.repeat(150)]
  const entries = Array.from({ length: 28 }, (_, index) => {
    const rsvp = ['accepted', 'accepted', 'pending', 'declined'][index % 4]
    const status = ['scheduled', 'finalized', 'cancelled'][index % 3]
    const summary = { id: index + 1, title: `${titles[index % titles.length]}${index < 5 ? '' : ` ${index + 1}`}`, host: index % 4 === 0 ? { id: 7, username: 'you', avatar_url: null } : host,
      starts_at: '2027-07-16T18:00:00.000000Z', timezone: 'Asia/Beirut', status, my_rsvp: rsvp }
    return rsvp === 'accepted' ? { ...summary, finalized_tmdb_id: status === 'finalized' ? 550 : null, finalized_at: null, cancelled_at: null, voting_open: status === 'scheduled', created_at: '', updated_at: '' } : summary
  })
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const reply = (json, status = 200) => route.fulfill({ status, headers, json })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push({ path, query: url.search, method: request.method() })
    if (path === '/api/v1/auth/me') return auth === 'guest' ? reply({ message: 'Unauthenticated.' }, 401) : reply({ data: { id: owner, username: `fixture_${owner}`, email: 'fixture@example.test', avatar_url: null, email_verified_at: auth === 'verified' ? '2026-01-01T00:00:00Z' : null } })
    if (path === '/api/v1/me/access') return reply({ data: { role: 'user', account_status: account } })
    if (/^\/api\/v1\/me\/movie-nights\/\d+$/.test(path)) {
      const event = entries.find(item => item.id === Number(path.split('/').at(-1)))
      return event?.my_rsvp === 'accepted' ? reply({ data: { ...event, location: 'Fixture hall', meeting_url: null } }) : reply({ message: 'Not found.' }, 404)
    }
    if (path === '/api/v1/me/movie-nights' || path === '/api/v1/me/movie-nights/invitations') {
      if (delay) await new Promise(resolve => setTimeout(resolve, 900))
      if (failure) return reply({ message: 'SQL SECRET', code: 'UPSTREAM_UNAVAILABLE' }, 503)
      const inbox = path.endsWith('/invitations')
      let items = owner === 7 ? entries : []
      if (!inbox && url.searchParams.has('status')) items = items.filter(item => item.status === url.searchParams.get('status'))
      if (inbox) items = items.filter(item => item.host.id !== owner).map(item => ({ id: item.id, participant: { id: owner, username: 'you', avatar_url: null }, rsvp_status: item.my_rsvp, responded_at: null, movie_night: item }))
      const current = Number(url.searchParams.get('page') ?? 1), perPage = Number(url.searchParams.get('per_page') ?? 20)
      return reply({ data: items.slice((current - 1) * perPage, current * perPage), meta: { page: current, per_page: perPage, total_pages: Math.ceil(items.length / perPage), total_results: items.length } })
    }
    if (path === '/api/v1/movies/genres') return reply({ data: [] })
    if (path.startsWith('/api/v1/movies/')) return reply({ data: [], meta: { page: 1, total_pages: 0, total_results: 0 } })
    return reply({ message: 'Unexpected test request.' }, 404)
  })
  const loaded = async label => { await page.getByRole('list', { name: label ?? 'Your movie nights', exact: true }).waitFor() }
  const shot = async name => { if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: false }) }
  await page.goto(`${base}/movie-nights`); await loaded()
  assert(await page.title() === 'Movie Nights — VYBE', 'Incorrect document title')
  for (const label of ['Hosting', 'Going', 'Invited', 'Declined']) assert(await page.getByText(label, { exact: true }).count() > 0, `Missing ${label}`)
  assert(await page.getByRole('link', { name: 'Create Movie Night', exact: false }).count() === 1, 'Create action missing')
  const nav = page.getByRole('navigation', { name: 'Movie navigation', exact: true })
  assert((await nav.getByRole('link').allTextContents()).join('|') === 'Home|Discover|For You|Library|Movie Nights', 'Navigation order changed')
  assert(await nav.getByRole('link', { name: 'Movie Nights', exact: true }).getAttribute('aria-current') === 'page', 'Section nav not active')
  checks.push('Dashboard heading, title, navigation order/highlight, create action and four relationship labels')

  for (const view of ['nights', 'invitations']) {
    await page.goto(`${base}/movie-nights?view=${view}`); await loaded(view === 'nights' ? 'Your movie nights' : 'Received invitations')
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(1000) // Let the existing entrance/navigation motion settle for visual QA.
      await shot(`${view}-${width}`)
      const boxes = await page.evaluate(() => {
        const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom, right: box.right } }
        return { overflow: document.documentElement.scrollWidth > innerWidth, header: rect(document.querySelector('.app-header')), heading: rect(document.querySelector('.night-heading')), content: rect(document.querySelector('.movie-nights-page')),
          nav: [...document.querySelectorAll('.discovery-nav a')].map(rect), cards: [...document.querySelectorAll('.night-card')].map(rect) }
      })
      assert(boxes.heading.height > 100, `Heading collapsed at ${view}/${width}`)
      assert(!boxes.overflow, `Horizontal overflow at ${view}/${width}`)
      assert(boxes.content.y >= boxes.header.bottom, `Content overlaps header at ${view}/${width}`)
      for (const box of [...boxes.nav, ...boxes.cards]) assert(box.x >= 0 && box.right <= width + 1, `Element outside viewport at ${view}/${width}`)
      for (let i = 0; i < boxes.nav.length - 1; i++) assert(boxes.nav[i].right <= boxes.nav[i + 1].x + 1, `Navigation overlaps at ${width}`)
      geometry.push({ view, width, headerHeight: boxes.header.height, headingHeight: boxes.heading.height, columns: new Set(boxes.cards.map(box => Math.round(box.x))).size, overflow: boxes.overflow })
    }
  }
  checks.push('Eight screenshot/bounding-box checks: both views at 390/768/1024/1440, long titles/usernames, no overflow or header/nav overlap')

  await page.goto(`${base}/movie-nights?view=nights&status=scheduled`); await loaded()
  assert(requests.some(request => request.path === '/api/v1/me/movie-nights' && request.query.includes('status=scheduled')), 'Status not sent to server')
  assert(await page.locator('.night-status').evaluateAll(items => items.every(item => item.textContent === 'Scheduled')), 'Unfiltered scheduled cards')
  await page.getByRole('navigation', { name: 'Event status', exact: true }).getByRole('link', { name: 'All', exact: true }).click(); await loaded()
  await page.getByRole('link', { name: 'Next page', exact: false }).click()
  await page.waitForURL(/page=2/); await loaded()
  await page.reload(); await loaded()
  assert(await page.getByText('Page', { exact: false }).filter({ hasText: '2' }).count() > 0, 'Pagination did not survive reload')
  await page.getByRole('navigation', { name: 'Event status', exact: true }).getByRole('link', { name: 'Finalized', exact: true }).click()
  await page.waitForURL(/status=finalized/); await loaded()
  assert(!new URL(page.url()).searchParams.has('page'), 'Filter failed to reset page')
  await page.goBack(); await loaded()
  assert(new URL(page.url()).searchParams.get('page') === '2', 'Browser back failed to restore page')
  checks.push('Server status filter and pagination, reload persistence, filter page reset, browser back restoration')

  await page.getByRole('link', { name: 'Invitations', exact: true }).click(); await loaded('Received invitations')
  await page.getByRole('link', { name: 'Next page', exact: false }).click(); await loaded('Received invitations')
  assert(new URL(page.url()).searchParams.get('view') === 'invitations', 'Inbox pagination lost selected view')
  assert(!requests.filter(request => request.path.endsWith('/movie-nights/invitations')).some(request => request.query.includes('status=')), 'Unsupported inbox status filter sent')
  assert(await page.getByRole('navigation', { name: 'Event status' }).count() === 0, 'Inbox filters a partial page')
  assert(await page.locator('.night-card').filter({ has: page.locator('.night-relationship.is-pending, .night-relationship.is-declined') }).getByRole('link').count() === 0, 'Pending/declined summary has private detail link')
  assert(!requests.some(request => /\/movie-nights\/\d/.test(request.path)), 'Dashboard requested private details')
  assert(!requests.some(request => request.method !== 'GET'), 'Dashboard wrote data')
  checks.push('Independent inbox pagination, minimal pending/declined cards, no unsupported filters/private detail requests/mutations')

  await page.goto(`${base}/movie-nights`); await loaded()
  await page.getByRole('link', { name: 'Create Movie Night', exact: false }).click()
  await page.waitForURL(/movie-nights\/new$/); await page.getByRole('heading', { name: 'Create a movie night.' }).waitFor()
  assert(await nav.getByRole('link', { name: 'Movie Nights', exact: true }).getAttribute('aria-current') === 'page', 'New route lost highlight')
  await page.getByRole('link', { name: '← Movie Nights', exact: true }).click(); await loaded()
  await page.getByRole('link', { name: /^View Friday,/ }).first().click()
  await page.getByRole('heading', { name: 'Friday, under the stars.' }).waitFor()
  assert(await nav.getByRole('link', { name: 'Movie Nights', exact: true }).getAttribute('aria-current') === 'page', 'Detail route lost highlight')
  checks.push('Three lazy routes and active highlighting; creation and accepted-detail destinations render')

  account = 'restricted'; await page.goto(`${base}/movie-nights`); await loaded()
  assert(await page.getByRole('link', { name: 'Create Movie Night', exact: false }).count() === 0, 'Restricted account can create')
  assert(await page.getByText('Creating events is unavailable', { exact: false }).count() === 1, 'Restricted notice missing')
  checks.push('Restricted verified account retains reads and has no creation action')
  account = 'active'; owner = 8; await page.reload()
  await page.getByRole('heading', { name: 'Your next movie night starts here.' }).waitFor()
  assert(await page.getByText('Friday, under the stars', { exact: true }).count() === 0, 'Other owner data retained')
  await page.goto(`${base}/movie-nights?view=invitations`)
  await page.getByRole('heading', { name: 'No invitations just yet.' }).waitFor()
  checks.push('Empty event/inbox states and owner-isolated reload')

  owner = 7; failure = true; await page.goto(`${base}/movie-nights`)
  await page.getByRole('button', { name: 'Try again', exact: false }).waitFor()
  assert(!await page.getByText('SQL SECRET', { exact: false }).count(), 'Raw error leaked')
  failure = false; await page.getByRole('button', { name: 'Try again', exact: false }).click(); await loaded()
  checks.push('Safe error and successful explicit retry')
  delay = true; await page.reload(); await page.getByRole('status', { name: 'Loading movie nights', exact: true }).waitFor(); await loaded(); delay = false
  await page.goto(`${base}/movie-nights?page=0`); await page.getByRole('heading', { name: 'That view is out of frame.' }).waitFor()
  await page.goto(`${base}/movie-nights?page=999`); await page.getByRole('heading', { name: 'No movie nights on this page.' }).waitFor()
  checks.push('Loading, invalid URL and out-of-range page states')

  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${base}/movie-nights`); await loaded()
  const activeFilter = page.getByRole('navigation', { name: 'Event status' }).getByRole('link', { name: 'Scheduled', exact: true })
  await activeFilter.focus()
  assert(await activeFilter.evaluate(element => getComputedStyle(element).outlineStyle !== 'none'), 'No visible keyboard focus')
  await page.keyboard.press('Enter'); await page.waitForURL(/status=scheduled/); await loaded()
  assert(await page.locator('.nav-indicator').evaluate(element => getComputedStyle(element).transitionDuration) === '0s', 'Navigation ignored reduced motion')
  assert(await page.locator('[data-react-bits="animated-content"]').evaluate(element => getComputedStyle(element).opacity) === '1', 'Reduced-motion heading hidden')
  checks.push('Keyboard filter activation, visible focus, reduced-motion navigation and entrance visibility')
  for (const path of ['/', '/discover']) {
    await page.goto(`${base}${path}`)
    await page.getByRole('heading', { level: 1 }).waitFor()
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Shared header overflow at ${path}/${width}`)
      assert(await nav.getByRole('link', { name: path === '/' ? 'Home' : 'Discover', exact: true }).getAttribute('aria-current') === 'page', 'Existing nav highlight changed')
      const alignment = await page.evaluate(() => ({ actual: document.querySelector('.app-header').getBoundingClientRect().height, token: parseFloat(getComputedStyle(document.querySelector('.app-layout')).getPropertyValue('--header-height')) }))
      assert(Math.abs(alignment.actual - alignment.token) <= 1, `Header token mismatch at ${path}/${width}`)
    }
  }
  checks.push('Home/Discover shared navigation smoke at all four widths, no overflow, correct active links and header/scroll-offset token')
  for (const path of ['/movie-nights', '/movie-nights/new', '/movie-nights/1']) {
    auth = 'guest'; await page.goto(`${base}${path}`); await page.waitForURL(/\/login$/)
    auth = 'unverified'; await page.goto(`${base}${path}`); await page.waitForURL(/\/verify-email$/)
  }
  checks.push('Guest and unverified guards on all three routes')
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
  return { checks, geometry, apiRequests: requests.length, privateDetailRequests: requests.filter(request => /\/movie-nights\/\d/.test(request.path)).length, writes: requests.filter(request => request.method !== 'GET').length, pageErrors: errors }
}
