// Stateful, synthetic Core HTTP. This suite never modifies real accounts or development records.
export async function runMovieNightManagementChecks(page, base = 'http://127.0.0.1:5187', screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const checks = [], requests = [], geometry = [], errors = []
  const unexpectedRequests = []
  page.on('pageerror', error => errors.push(error.message))
  let owner = 7, account = 'active', access = true, failure = '', slow = false, nextId = 101
  const host = { id: 7, username: 'cinema_host', avatar_url: null }
  const initial = { id: 12, title: 'A night worth sharing', host, starts_at: '2030-07-16T18:00:00.000000Z', timezone: 'Asia/Beirut', status: 'scheduled', my_rsvp: 'accepted', finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, voting_open: true, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', location: 'Private cinema room', meeting_url: 'https://example.test/private-room' }
  const events = new Map([[12, { ...initial }]])
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' }
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  await page.route('**/sanctum/csrf-cookie', route => { requests.push({ path: '/sanctum/csrf-cookie', method: 'GET' }); return route.fulfill({ status: 204, headers }) })
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const reply = (json, status = 200) => route.fulfill({ status, headers, json })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = (method === 'POST' || method === 'PATCH') && request.postData() ? request.postDataJSON() : undefined
    requests.push({ path, method, body })
    if (path === '/api/v1/auth/me' && owner === 0) return reply({ message: 'Unauthenticated.' }, 401)
    if (path === '/api/v1/auth/me') return reply({ data: { id: owner, username: `fixture_${owner}`, email: 'fixture@example.test', avatar_url: null, email_verified_at: '2026-01-01T00:00:00Z' } })
    if (/^\/api\/v1\/me\/movie-nights\/\d+\/invitations$/.test(path) && method === 'GET') return reply({ data: [], meta: { page: 1, per_page: 12, total_pages: 0, total_results: 0 } })
    if (path === '/api/v1/me/access') return reply({ data: { role: 'user', account_status: account } })
    if (path === '/api/v1/auth/logout') { owner = 0; return reply({}) }
    if (path === '/api/v1/me/movie-nights' && method === 'POST') {
      if (slow) await new Promise(resolve => setTimeout(resolve, 1000))
      if (failure === 'create') return reply({ message: 'Check fields.', errors: { title: ['Choose another title.'] } }, 422)
      const event = { ...initial, ...body, id: nextId++, host: { ...host, id: owner }, updated_at: '2026-11-02T00:00:00Z' }
      events.set(event.id, event)
      return reply({ data: event }, 201)
    }
    if (path === '/api/v1/me/movie-nights' || path === '/api/v1/me/movie-nights/invitations') return reply({ data: [], meta: { page: 1, per_page: 12, total_pages: 0, total_results: 0 } })
    const match = path.match(/^\/api\/v1\/me\/movie-nights\/(\d+)(\/cancel)?$/)
    if (!match) { unexpectedRequests.push(`${method} ${path}`); return reply({ message: 'Unexpected test request.' }, 404) }
    const id = Number(match[1]), event = events.get(id)
    if (!event || !access) return reply({ message: 'Not found.' }, 404)
    if (method === 'GET') return failure === 'read' ? reply({ message: 'SQL SECRET' }, 503) : reply({ data: event })
    if (slow) await new Promise(resolve => setTimeout(resolve, 1000))
    if (method === 'PATCH') {
      if (failure === 'edit') return reply({ message: 'Check fields.', errors: { location: ['Use a different location.'] } }, 422)
      if (failure === 'closed') { event.status = 'cancelled'; event.voting_open = false; return reply({ message: 'Movie night is closed.' }, 409) }
      Object.assign(event, body, { updated_at: '2026-11-03T00:00:00Z' })
      return reply({ data: event })
    }
    if (match[2] && method === 'POST') {
      if (failure === 'cancel') return reply({ message: 'SQL SECRET' }, 503)
      Object.assign(event, { status: 'cancelled', voting_open: false, cancelled_at: '2026-11-04T00:00:00Z', updated_at: '2026-11-04T00:00:00Z', title: 'Cancelled by the server' })
      return reply({ data: event })
    }
    return reply({ message: 'Not allowed.' }, 403)
  })
  const input = name => page.getByLabel(name, { exact: true })
  const fill = async (title = 'Together at the movies') => {
    await input('Event title').fill(title)
    await input('Scheduled date').fill('2030-07-16')
    await input('Scheduled time').fill('21:00:00')
    await input('Timezone').fill('Asia/Beirut')
    await input('Physical location (optional)').fill('Our private room')
    await input('Meeting URL (optional)').fill('https://example.test/our-room')
  }
  const focusRefresh = () => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const dialog = () => page.getByRole('dialog')
  const shot = async name => { if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: false }) }
  const layout = async (name, modal = false) => {
    for (const width of [390, 768, 1024, 1440]) {
      if (!modal) await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      if (modal) await dialog().evaluate(element => { element.scrollTop = 0 })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.waitForTimeout(100)
      await shot(`${name}-${width}`)
      const boxes = await page.evaluate(modal => {
        const elements = document.querySelectorAll(modal ? 'dialog[open], dialog[open] input, dialog[open] .button' : '.movie-nights-page, .night-form-panel, .night-detail-panel, .night-future-sections, .movie-nights-page input')
        return { scrollY, headerBottom: document.querySelector('.app-header').getBoundingClientRect().bottom, contentTop: document.querySelector('.movie-nights-page').getBoundingClientRect().top, overflow: document.documentElement.scrollWidth > innerWidth, boxes: [...elements].map(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width } }) }
      }, modal)
      if (!modal) assert(boxes.scrollY === 0 && boxes.contentTop >= boxes.headerBottom, `${name} screenshot is not at the unobscured page top`)
      assert(!boxes.overflow && boxes.boxes.every(box => box.left >= 0 && box.right <= width + 1), `${name} overflow at ${width}`)
      if (modal) assert(await dialog().evaluate(element => element.scrollWidth <= element.clientWidth), `${name} dialog scroll overflow`)
      geometry.push({ state: name, width, overflow: boxes.overflow })
    }
  }
  await page.goto(`${base}/movie-nights/new`); await input('Event title').waitFor()
  assert(await input('Timezone').inputValue() !== '', 'Browser timezone suggestion missing')
  await fill()
  await layout('create')
  await input('Timezone').fill('America/New_York')
  assert(await input('Scheduled date').inputValue() === '2030-07-16' && await input('Scheduled time').inputValue() === '21:00:00', 'Timezone changed wall time')
  await input('Timezone').fill('Asia/Beirut')
  failure = 'create'; await page.getByRole('button', { name: 'Create Movie Night', exact: true }).click()
  await page.getByText('Choose another title.', { exact: true }).waitFor()
  assert(await input('Physical location (optional)').inputValue() === 'Our private room', '422 cleared values')
  failure = ''; slow = true
  const before = requests.filter(request => request.path === '/api/v1/me/movie-nights' && request.method === 'POST').length
  await page.locator('.night-event-form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await page.waitForURL(/\/movie-nights\/101$/)
  await page.getByRole('heading', { name: 'Together at the movies.', exact: true }).waitFor()
  slow = false
  assert(requests.filter(request => request.path === '/api/v1/me/movie-nights' && request.method === 'POST').length === before + 1, 'Duplicate create submitted')
  const created = requests.filter(request => request.path === '/api/v1/me/movie-nights' && request.method === 'POST').at(-1)
  assert(JSON.stringify(created.body) === JSON.stringify({ title: 'Together at the movies', starts_at: '2030-07-16T18:00:00Z', timezone: 'Asia/Beirut', location: 'Our private room', meeting_url: 'https://example.test/our-room' }), 'Create payload mismatch')
  checks.push('Browser timezone suggestion, preserved wall time, explicit preview, creation 422 recovery, exact UTC payload, duplicate prevention and authoritative ID navigation')

  await layout('details')
  for (const heading of ['Participants', 'Shared shortlist', 'Voting']) assert(await page.getByRole('heading', { name: heading, exact: true }).count() === 1, 'Future section missing')
  const external = page.getByRole('link', { name: /example.test\/our-room/ })
  assert((await external.getAttribute('rel')).includes('noopener'), 'Meeting link opener protection missing')
  await page.getByRole('button', { name: 'Edit movie night', exact: true }).click(); await dialog().waitFor()
  assert(await input('Scheduled time').inputValue() === '21:00:00', 'Edit did not convert stored UTC to local')
  await layout('edit', true)
  await input('Event title').fill('Our edited movie night')
  await input('Physical location (optional)').fill('')
  await input('Meeting URL (optional)').fill('')
  failure = 'edit'; await dialog().getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByText('Use a different location.', { exact: true }).waitFor()
  assert(await input('Event title').inputValue() === 'Our edited movie night', 'Edit failure lost title')
  failure = ''; slow = true
  const edits = requests.filter(request => request.method === 'PATCH').length
  await page.locator('.night-event-form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await dialog().waitFor({ state: 'hidden' }); slow = false
  await page.getByRole('heading', { name: 'Our edited movie night.', exact: true }).waitFor()
  assert(requests.filter(request => request.method === 'PATCH').length === edits + 1, 'Duplicate edit submitted')
  assert(JSON.stringify(requests.filter(request => request.method === 'PATCH').at(-1).body) === JSON.stringify({ title: 'Our edited movie night', location: null, meeting_url: null }), 'Optional clearing or PATCH fields wrong')
  assert(!await page.getByText('Our private room', { exact: true }).count(), 'Cleared location retained')
  checks.push('Private detail, explicit future sections, safe meeting link, UTC-to-local edit, validation recovery, minimal PATCH/null clearing, duplicate prevention and immediate authoritative update')

  const edit = page.getByRole('button', { name: 'Edit movie night', exact: true })
  await edit.click(); await dialog().waitFor()
  await page.keyboard.press('Shift+Tab')
  assert(await dialog().evaluate(element => element.contains(document.activeElement)), 'Keyboard focus escaped dialog')
  await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' })
  assert(await edit.evaluate(element => element === document.activeElement), 'Edit focus not restored')
  await page.getByRole('button', { name: 'Cancel movie night', exact: true }).click(); await dialog().waitFor()
  assert(await page.getByRole('button', { name: 'Keep movie night', exact: true }).evaluate(element => element === document.activeElement), 'Cancellation default is not safe')
  await layout('cancel', true)
  await page.getByRole('button', { name: 'Keep movie night', exact: true }).click(); await dialog().waitFor({ state: 'hidden' })
  assert(events.get(101).status === 'scheduled', 'Keeping event cancelled it')
  await page.getByRole('button', { name: 'Cancel movie night', exact: true }).click()
  failure = 'cancel'; await dialog().getByRole('button', { name: 'Cancel movie night', exact: true }).click()
  await dialog().getByRole('alert').waitFor()
  failure = ''; slow = true
  const cancels = requests.filter(request => request.path.endsWith('/cancel')).length
  await dialog().getByRole('button', { name: 'Cancel movie night', exact: true }).evaluate(button => { button.click(); button.click() })
  await page.getByRole('heading', { name: 'Cancelled by the server.', exact: true }).waitFor(); slow = false
  assert(requests.filter(request => request.path.endsWith('/cancel')).length === cancels + 1, 'Duplicate cancellation submitted')
  assert(!await page.getByRole('button', { name: 'Edit movie night', exact: true }).count() && !await page.getByRole('button', { name: 'Cancel movie night', exact: true }).count(), 'Terminal actions remained')
  await layout('cancelled')
  checks.push('Dialog focus containment/Escape/restoration, safe irreversible confirmation, keep action, cancellation error/retry, immediate authoritative terminal state and read-only controls')

  await page.goto(`${base}/movie-nights/new`); await fill('DST test')
  await input('Timezone').fill('America/New_York')
  await input('Scheduled date').fill('2030-03-10'); await input('Scheduled time').fill('02:30')
  await page.getByRole('button', { name: 'Create Movie Night', exact: true }).click()
  assert(await page.getByText('does not exist', { exact: false }).count() > 0, 'DST gap accepted')
  await input('Scheduled date').fill('2030-11-03'); await input('Scheduled time').fill('01:30')
  await page.getByRole('button', { name: 'Create Movie Night', exact: true }).click()
  assert(await page.getByText('occurs twice', { exact: false }).count() > 0, 'Overlap choice not required')
  await page.getByRole('radio', { name: 'Later occurrence', exact: false }).check()
  await page.getByRole('button', { name: 'Create Movie Night', exact: true }).click()
  await page.waitForURL(/\/movie-nights\/102$/)
  assert(events.get(102).starts_at === '2030-11-03T06:30:00Z', 'Incorrect overlap serialization')
  checks.push('Real form interactions reject DST gaps and require an explicit later repeated-time occurrence')

  const reads = requests.filter(request => /movie-nights\/\d+$/.test(request.path)).length
  await page.goto(`${base}/movie-nights/01`); await page.getByRole('heading', { name: 'Movie night unavailable.', exact: true }).waitFor()
  assert(requests.filter(request => /movie-nights\/\d+$/.test(request.path)).length === reads, 'Invalid route fetched private data')
  access = false
  for (const membership of ['pending', 'declined', 'uninvited']) {
    await page.goto(`${base}/movie-nights/12`); await page.getByRole('heading', { name: 'Movie night unavailable.', exact: true }).waitFor()
    assert(!await page.getByText('Private cinema room', { exact: true }).count(), `${membership} read leaked private location`)
  }
  access = true; failure = 'read'; await page.reload(); await page.getByRole('button', { name: 'Try again', exact: false }).waitFor()
  assert(!await page.getByText('SQL SECRET', { exact: false }).count(), 'Raw error leaked')
  failure = ''; await page.getByRole('button', { name: 'Try again', exact: false }).click(); await page.getByRole('heading', { name: 'A night worth sharing.', exact: true }).waitFor()
  events.get(12).host = { ...host, id: 8 }; await page.reload(); await page.getByText('Going', { exact: true }).waitFor()
  assert(!await page.getByRole('button', { name: 'Edit movie night', exact: true }).count(), 'Participant can edit')
  events.get(12).host = host; account = 'restricted'; await page.reload(); await page.getByText('Your account is restricted.', { exact: false }).waitFor()
  assert(!await page.getByRole('button', { name: 'Cancel movie night', exact: true }).count(), 'Restricted account can cancel')
  await page.goto(`${base}/movie-nights/new`); await page.getByRole('heading', { name: 'Creation is unavailable.', exact: true }).waitFor()
  assert(!await input('Event title').count(), 'Restricted creation form mounted')
  checks.push('Invalid route without fetch, hidden unauthorized detail, safe read retry, accepted participant read-only and restricted detail/create boundaries')

  account = 'active'; events.get(12).status = 'scheduled'; events.get(12).voting_open = true
  await page.goto(`${base}/movie-nights/12`)
  await page.getByRole('button', { name: 'Edit movie night', exact: true }).click()
  await input('Event title').fill('Racing with closure')
  failure = 'closed'; await dialog().getByRole('button', { name: 'Save changes', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  await page.getByText('This movie night is cancelled.', { exact: false }).waitFor()
  failure = ''; events.get(12).status = 'scheduled'; events.get(12).voting_open = true
  checks.push('A backend lifecycle conflict refreshes detail and closes the stale edit form without restoring its draft')
  account = 'active'; await page.goto(`${base}/movie-nights/12`)
  await page.getByRole('button', { name: 'Edit movie night', exact: true }).click(); await input('Physical location (optional)').fill('UNSAVED PRIVATE SECRET')
  access = false; await focusRefresh()
  await page.getByRole('heading', { name: 'Movie night unavailable.', exact: true }).waitFor()
  assert(!await dialog().count() && !await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === 'UNSAVED PRIVATE SECRET')), 'Revoked edit state retained')
  access = true; await page.goto(`${base}/movie-nights/new`); await fill('PRIVATE CREATE DRAFT')
  account = 'restricted'; await focusRefresh()
  await page.getByRole('heading', { name: 'Creation is unavailable.', exact: true }).waitFor()
  account = 'active'; await focusRefresh(); await input('Event title').waitFor()
  assert(await input('Event title').inputValue() === '', 'Restriction retained creation draft')
  await fill('OLD ACCOUNT SECRET'); owner = 8
  await page.waitForTimeout(5100); await focusRefresh()
  await page.getByRole('link', { name: 'Your profile, fixture_8', exact: true }).waitFor()
  await input('Event title').waitFor()
  assert(await input('Event title').inputValue() === '' && await input('Meeting URL (optional)').inputValue() === '', 'Account switch retained private draft')
  await fill('LOGOUT PRIVATE DRAFT'); await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.locator('.night-event-form').waitFor({ state: 'hidden' })
  assert(!await input('Event title').count() && !await page.getByText('LOGOUT PRIVATE DRAFT', { exact: false }).count(), 'Logout retained sensitive form')
  checks.push('Revoked mounted edit clears draft/dialog, restriction clears creation form, account switch/logout clear title/location/meeting draft')

  // Keep the page mounted across each permission transition. Fixture lifecycle restoration
  // represents a corrected server projection, not a product reopen/finalization operation.
  const restorationCases = []
  for (const kind of ['edit', 'cancel']) {
    for (const cause of ['restriction', 'deadline', 'lifecycle', 'access']) {
      owner = 7; account = 'active'; access = true; failure = ''
      const event = events.get(12)
      Object.assign(event, initial, { title: `Before ${kind} ${cause}` })
      if (cause === 'deadline') event.starts_at = new Date(Date.now() + 2000).toISOString()
      await page.goto(`${base}/movie-nights/12`)
      await page.getByRole('button', { name: kind === 'edit' ? 'Edit movie night' : 'Cancel movie night', exact: true }).click()
      await dialog().waitFor()
      if (kind === 'edit') {
        await input('Event title').fill('SENSITIVE OLD TITLE')
        await input('Physical location (optional)').fill('SENSITIVE OLD DRAFT')
      } else if (cause === 'restriction') {
        failure = 'cancel'
        await dialog().getByRole('button', { name: 'Cancel movie night', exact: true }).click()
        await dialog().getByRole('alert').waitFor()
        failure = ''
      }
      if (cause === 'restriction') {
        account = 'restricted'; await focusRefresh()
        await page.getByText('Your account is restricted.', { exact: false }).waitFor()
      } else if (cause === 'deadline') {
        // Reaching starts_at removes editing, but scheduled hosts may still cancel.
        await page.locator('.night-notice').filter({ hasText: 'The scheduled start has been reached' }).waitFor()
      } else if (cause === 'lifecycle') {
        event.status = 'finalized'; event.voting_open = false; await focusRefresh()
        await page.locator('.night-notice').filter({ hasText: 'This movie night is finalized.' }).waitFor()
      } else {
        access = false; await focusRefresh()
        await page.getByRole('heading', { name: 'Movie night unavailable.', exact: true }).waitFor()
      }
      if (cause === 'deadline' && kind === 'cancel') {
        assert(await dialog().count() === 1, 'Deadline incorrectly revoked cancellation permission')
        await page.getByRole('button', { name: 'Keep movie night', exact: true }).click()
      } else {
        await dialog().waitFor({ state: 'hidden' })
        assert(!await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value.includes('SENSITIVE OLD'))), 'Permission loss retained an editable private draft')
      }
      const title = `Restored ${kind} ${cause}`, location = `Fresh authoritative location for ${kind} ${cause}`
      Object.assign(event, { title, location, status: 'scheduled', starts_at: initial.starts_at, voting_open: true })
      account = 'active'; access = true; await focusRefresh()
      if (cause === 'access') {
        // The revoked boundary stays closed even when a server-side membership flag is restored.
        assert(await page.getByRole('heading', { name: 'Movie night unavailable.', exact: true }).count() === 1, 'Revoked boundary reopened itself')
        await page.goto(`${base}/movie-nights/12`)
      }
      await page.locator('.night-detail h1').filter({ hasText: title }).waitFor()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert(await dialog().count() === 0, `${kind} dialog automatically reopened after ${cause} restoration`)
      await page.getByRole('button', { name: kind === 'edit' ? 'Edit movie night' : 'Cancel movie night', exact: true }).click()
      await dialog().waitFor()
      if (kind === 'edit') {
        assert(await input('Event title').inputValue() === title && await input('Physical location (optional)').inputValue() === location, 'Explicit reopen did not initialize fresh authoritative values')
      } else {
        assert(await dialog().getByRole('alert').count() === 0, 'Explicit reopen retained a stale cancellation error')
      }
      await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' })
      restorationCases.push({ dialog: kind, cause, explicitReopen: true })
    }
  }
  checks.push('Eight mounted edit/cancel permission scenarios: restriction, deadline, lifecycle and access loss/restoration; explicit reopen uses fresh values/errors')

  owner = 7; events.get(12).starts_at = new Date(Math.floor(Date.now() / 1000) * 1000 + 3000).toISOString()
  await page.goto(`${base}/movie-nights/12`); await page.getByRole('button', { name: 'Edit movie night', exact: true }).waitFor()
  await page.getByText('The scheduled start has been reached', { exact: false }).waitFor()
  assert(!await page.getByRole('button', { name: 'Edit movie night', exact: true }).count(), 'Deadline did not close editing')
  assert(await page.getByRole('button', { name: 'Cancel movie night', exact: true }).count() === 1, 'Deadline incorrectly closed cancellation')
  events.get(12).status = 'finalized'; events.get(12).voting_open = false; await page.reload()
  await page.getByText('This movie night is finalized.', { exact: false }).waitFor()
  assert(!await page.getByRole('button', { name: 'Edit movie night', exact: true }).count(), 'Finalized event editable')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('link', { name: 'Movie Nights', exact: true }).first().focus()
  assert(await page.getByRole('link', { name: 'Movie Nights', exact: true }).first().evaluate(element => getComputedStyle(element).outlineStyle !== 'none'), 'Keyboard focus invisible')
  checks.push('Time-sensitive start boundary updates without refetch, cancellation stays available after start, finalized read-only and reduced-motion focus')
  assert(!requests.some(request => /\/(rsvp|vote|votes|movies|finalize|eligible-users|invitations)$/.test(request.path) && request.method !== 'GET'), 'Out-of-scope mutation')
  assert(unexpectedRequests.length === 0, unexpectedRequests.join('; '))
  assert(errors.length === 0, errors.join('; '))
  return { checks, geometry, restorationCases, requests: requests.length, writes: requests.filter(request => ['POST', 'PATCH'].includes(request.method)), pageErrors: errors, unexpectedRequests }
}
