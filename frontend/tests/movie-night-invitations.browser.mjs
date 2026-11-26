// Isolated synthetic Core only: no real invitations, accounts or database changes.
export async function runMovieNightInvitationChecks(page, base = 'http://127.0.0.1:5187', screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const checks = [], requests = [], geometry = [], errors = [], unexpected = []
  page.on('pageerror', error => errors.push(error.message))
  let owner = 7, account = 'active', status = 'scheduled', start = '2030-07-16T18:00:00Z', allowed = true
  let heldRsvp = null
  const stateCases = []
  let response = 'pending', failSearch = false, failInvite = false, failRsvp = 0, slowRsvp = false, slowSearch = false
  const host = { id: 7, username: 'cinema_host', avatar_url: null }
  const people = Array.from({ length: 14 }, (_, i) => ({ id: 20 + i, username: `guest_${String(i).padStart(2, '0')}_long_username`, avatar_url: null }))
  const invited = new Set(people.slice(0, 13).map(person => person.id))
  const minimal = () => ({ id: 12, title: 'A seat for another story', host, starts_at: start, timezone: 'Asia/Beirut', status, my_rsvp: owner === 7 ? 'accepted' : response })
  const rich = () => ({ ...minimal(), voting_open: status === 'scheduled', finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' })
  const summary = () => owner === 7 || response === 'accepted' ? rich() : minimal()
  const invitation = (id, rsvp = response) => ({ id: 100 + id, participant: { id, username: id === 9 ? 'invitee' : people.find(person => person.id === id)?.username, avatar_url: null }, rsvp_status: rsvp, responded_at: rsvp === 'pending' ? null : '2026-11-26T10:00:00Z' })
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' }
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method()
    const reply = (json, code = 200) => route.fulfill({ status: code, headers, json })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = req.postData() ? req.postDataJSON() : undefined
    requests.push({ path, method, query: url.search, body, owner, response })
    if (path === '/api/v1/auth/me') return owner ? reply({ data: { ...host, id: owner, username: `fixture_${owner}`, email: 'fake@example.test', email_verified_at: '2026-01-01T00:00:00Z' } }) : reply({ message: 'Unauthenticated.' }, 401)
    if (/^\/api\/v1\/me\/movie-nights\/\d+\/movies$/.test(path) && method === 'GET') return reply({ data: [], meta: { page: 1, per_page: 12, total_pages: 0, total_results: 0, metadata_unavailable: false } })
    if (/^\/api\/v1\/me\/movie-nights\/\d+\/votes$/.test(path) && method === 'GET') return reply({ data: { totals: [], my_vote: null, total_votes: 0, leaders: [], voting_open: true } })
    if (path === '/api/v1/me/access') return reply({ data: { role: 'user', account_status: account } })
    if (path === '/api/v1/auth/logout') { owner = 0; return reply({}) }
    const paged = items => { const p = Number(url.searchParams.get('page') || 1), per = Number(url.searchParams.get('per_page') || 12); return reply({ data: items.slice((p - 1) * per, p * per), meta: { page: p, per_page: per, total_pages: Math.ceil(items.length / per), total_results: items.length } }) }
    if (path === '/api/v1/me/movie-nights') return paged(owner === 7 || owner === 9 && response === 'accepted' ? [summary()] : [])
    if (path === '/api/v1/me/movie-nights/invitations') return paged(owner === 9 && response !== 'accepted' ? [{ ...invitation(9), movie_night: summary() }] : [])
    if (path === '/api/v1/me/movie-nights/12') return allowed && (owner === 7 || owner === 9 && response === 'accepted') ? reply({ data: { ...rich(), location: 'PRIVATE_ROOM', meeting_url: 'https://example.test/private' } }) : reply({ message: 'Not found.' }, 404)
    if (path.endsWith('/12/eligible-users')) {
      if (owner !== 7) { unexpected.push('Non-host search'); return reply({}, 403) }
      const query = url.searchParams.get('query')
      if (slowSearch && query === 'old') await new Promise(resolve => setTimeout(resolve, 800))
      if (failSearch) return reply({ message: 'SQL SECRET' }, 503)
      return paged(query === 'old' ? [{ id: 99, username: 'old_result', avatar_url: null }] : query === 'none' ? [] : people.filter(person => !invited.has(person.id)))
    }
    if (path.endsWith('/12/invitations')) {
      if (owner !== 7) { unexpected.push('Non-host roster'); return reply({}, 403) }
      if (method === 'GET') return paged([...invited].map((id, i) => invitation(id, ['pending', 'accepted', 'declined'][i % 3])))
      if (failInvite) return reply({ errors: { invited_user_id: ['This person is no longer eligible.'] } }, 422)
      await new Promise(resolve => setTimeout(resolve, 250))
      if (invited.has(body.invited_user_id)) { unexpected.push('Duplicate invite'); return reply({}, 422) }
      invited.add(body.invited_user_id); return reply({ data: invitation(body.invited_user_id, 'pending') }, 201)
    }
    if (path.endsWith('/12/rsvp') && method === 'PUT') {
      const requestOwner = owner
      if (heldRsvp) {
        const hold = heldRsvp, failure = failRsvp
        hold.started = true
        // Synthetic server decision is fixed before external permission changes;
        // only transport completion is held. No real writes are performed.
        await hold.promise
        if (failure) return reply({ message: 'Held failed response.' }, failure)
        response = body.rsvp_status
        return reply({ data: invitation(9) })
      }
      if (slowRsvp) await new Promise(resolve => setTimeout(resolve, typeof slowRsvp === 'number' ? slowRsvp : 900))
      if (failRsvp) return reply({ message: 'Core declined this change.' }, failRsvp)
      if (requestOwner !== 9 || status !== 'scheduled' || Date.parse(start) <= Date.now() || account !== 'active') return reply({ message: 'Closed.' }, 409)
      response = body.rsvp_status; return reply({ data: invitation(9) })
    }
    if (path.startsWith('/api/v1/movies/')) return reply({ data: [], meta: { page: 1, total_pages: 0, total_results: 0 } })
    unexpected.push(`${method} ${path}`); return reply({}, 404)
  })
  const go = async path => { await page.goto(`${base}${path}`); await page.getByRole('heading').first().waitFor() }
  const refresh = () => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const dialog = () => page.getByRole('dialog')
  const inbox = async () => { await go('/movie-nights?view=invitations&status=scheduled&page=1'); await page.getByRole('list', { name: 'Received invitations' }).waitFor() }
  const layout = async (view, modal = false) => {
    for (const width of [390, 768, 1024, 1440]) {
      if (!modal) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0))
      if (modal) await dialog().evaluate(element => { element.scrollTop = 0 })
      await page.waitForTimeout(150)
      const result = await page.evaluate(modal => {
        const content = document.querySelector(modal ? 'dialog' : '.movie-nights-page').getBoundingClientRect(), header = document.querySelector('.app-header').getBoundingClientRect()
        return { overflow: document.documentElement.scrollWidth > innerWidth, left: content.left, right: content.right, top: content.top, headerBottom: header.bottom, modalOverflow: modal && document.querySelector('dialog').scrollWidth > document.querySelector('dialog').clientWidth }
      }, modal)
      assert(!result.overflow && !result.modalOverflow && result.left >= 0 && result.right <= width + 1, `${view}/${width} overflow`)
      if (!modal) assert(result.top >= result.headerBottom, `${view}/${width} header overlap`)
      geometry.push({ view, width, ...result }); if (screenshots) await page.screenshot({ path: `${screenshots}/${view}-${width}.png`, fullPage: view === 'host-roster' })
    }
  }
  await go('/movie-nights/12'); await page.getByRole('list', { name: 'Invited participants' }).waitFor()
  for (const label of ['Pending', 'Accepted', 'Declined']) assert(await page.locator('.night-person').getByText(label, { exact: true }).count() > 0, `Missing ${label}`)
  assert(await page.locator('.night-person').getByText('Host', { exact: true }).count() === 1, 'Host missing')
  await page.getByRole('navigation', { name: 'Participant pages' }).getByRole('button', { name: 'Next' }).click(); await page.getByRole('list', { name: 'Invited participants' }).getByText('@guest_12_long_username').waitFor(); await page.getByRole('navigation', { name: 'Participant pages' }).getByRole('button', { name: 'Previous' }).click(); await page.getByRole('list', { name: 'Invited participants' }).getByText('@guest_00_long_username').waitFor()
  await layout('host-roster'); checks.push('Host separately represented; paginated roster endpoint and all RSVP labels/response dates')
  await page.getByRole('button', { name: 'Invite people', exact: true }).click(); await page.getByLabel('Search username', { exact: true }).fill('ab'); await page.waitForTimeout(450)
  assert(!requests.some(item => item.path.endsWith('eligible-users')), 'Invalid search requested')
  await page.getByLabel('Search username', { exact: true }).fill(' GUEST '); await page.getByRole('list', { name: 'Eligible people' }).waitFor()
  assert(requests.some(item => item.query.includes('query=guest')), 'Search not normalized')
  await page.keyboard.press('Shift+Tab'); assert(await page.getByRole('button', { name: 'Close dialog' }).evaluate(element => element === document.activeElement), 'Search keyboard order')
  await page.keyboard.press('Shift+Tab'); assert(await dialog().evaluate(element => element.contains(document.activeElement)), 'Dialog focus escaped')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await layout('invite-search', true)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  // Need enough eligible records to exercise independent server paging.
  invited.clear(); await page.getByRole('button', { name: 'Invite people', exact: true }).click(); await page.getByLabel('Search username', { exact: true }).fill('guest'); await page.getByRole('list', { name: 'Eligible people' }).waitFor()
  await page.getByRole('navigation', { name: 'Username search pages' }).getByRole('button', { name: 'Next' }).click()
  await page.getByText('@guest_12_long_username', { exact: true }).waitFor()
  assert(requests.some(item => item.path.endsWith('eligible-users') && item.query.includes('page=2')), 'Search not paged')
  await page.getByLabel('Search username', { exact: true }).fill('none'); await page.getByText('No eligible people match', { exact: false }).waitFor()
  slowSearch = true; await page.getByLabel('Search username', { exact: true }).fill('old'); await page.waitForTimeout(400); await page.getByLabel('Search username', { exact: true }).fill('new'); await page.getByRole('list', { name: 'Eligible people' }).waitFor(); await page.waitForTimeout(850)
  assert(!await page.getByText('@old_result').count(), 'Stale search replaced new results')
  failSearch = true; await page.getByLabel('Search username', { exact: true }).fill('error'); await page.getByText('Search unavailable.').waitFor(); assert(!await page.getByText('SQL SECRET').count(), 'Unsafe API error')
  failSearch = false; await page.getByRole('button', { name: 'Try again' }).click(); await page.getByRole('list', { name: 'Eligible people' }).waitFor()
  checks.push('Debounced normalized search, invalid constraints, server paging, empty state, stale response isolation and recoverable failure')
  failInvite = true; await page.getByRole('button', { name: 'Invite @guest_00_long_username', exact: true }).click(); await page.getByRole('alert').waitFor(); assert(await page.getByRole('alert').innerText() === 'This person is no longer eligible.', 'Missing invitation validation error')
  failInvite = false; const before = requests.filter(item => item.method === 'POST').length
  await page.getByRole('button', { name: 'Invite @guest_00_long_username', exact: true }).dblclick(); await page.getByText('Invitation sent.', { exact: false }).waitFor()
  assert(requests.filter(item => item.method === 'POST').length === before + 1, 'Duplicate invitation sent')
  await page.getByRole('button', { name: 'Close dialog' }).click(); await page.getByRole('list', { name: 'Invited participants' }).getByText('@guest_00_long_username').waitFor()
  checks.push('422 invite recovery; duplicate submission blocked; authoritative roster/search refresh')
  // Mounted permission restoration: fresh dialog requires explicit action.
  for (const reason of ['restriction', 'lifecycle', 'deadline', 'access']) {
    account = 'active'; status = 'scheduled'; start = '2030-07-16T18:00:00Z'; allowed = true
    await go('/movie-nights/12'); await page.getByRole('button', { name: 'Invite people', exact: true }).click(); await page.getByLabel('Search username', { exact: true }).fill('sensitive'); await page.waitForTimeout(200)
    if (reason === 'restriction') account = 'restricted'
    if (reason === 'lifecycle') status = 'cancelled'
    if (reason === 'deadline') start = '2020-01-01T00:00:00Z'
    if (reason === 'access') allowed = false
    await refresh(); await dialog().waitFor({ state: 'detached' })
    account = 'active'; status = 'scheduled'; start = '2030-07-16T18:00:00Z'; allowed = true
    if (reason === 'access') await page.reload(); else await refresh()
    await page.getByRole('button', { name: 'Invite people', exact: true }).waitFor(); assert(!await dialog().count(), `${reason}: auto-reopened`)
    await page.getByRole('button', { name: 'Invite people', exact: true }).click(); assert(await page.getByLabel('Search username', { exact: true }).inputValue() === '', 'Search draft retained'); await page.keyboard.press('Escape')
  }
  checks.push('Four mounted invite-dialog loss/restoration cases: restriction, lifecycle, deadline and access; drafts cleared, no automatic reopen')
  owner = 9; response = 'pending'; await inbox(); await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor()
  assert(!await page.getByRole('link', { name: 'View A seat', exact: false }).count(), 'Pending private detail link')
  const privateBefore = requests.filter(item => item.path.endsWith('/12') && item.owner === 9).length
  assert(privateBefore === 0, 'Pending requested private detail')
  await layout('pending-inbox')
  failRsvp = 500; await page.getByRole('button', { name: 'Decline invitation', exact: true }).click(); await page.getByRole('alert').waitFor()
  assert(response === 'pending' && !await page.getByText('PRIVATE_ROOM').count(), 'Failed decline changed membership')
  failRsvp = 0; slowRsvp = true; await page.getByRole('button', { name: 'Accept invitation', exact: true }).dblclick(); await page.waitForURL(/movie-nights\/12$/); await page.getByText('PRIVATE_ROOM', { exact: true }).waitFor()
  assert(requests.some(item => item.path.endsWith('/12') && item.owner === 9 && item.response === 'accepted'), 'No fresh detail read after acceptance')
  assert(!requests.some(item => item.path.endsWith('/12/invitations') && item.owner === 9), 'Accepted fetched host roster')
  checks.push('Pending remains minimal, failed response retains invitation, duplicate acceptance prevented, fresh private GET only after confirmed acceptance; no participant roster query')
  slowRsvp = false; await layout('accepted-detail')
  await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await dialog().getByText('existing vote will be removed', { exact: false }).waitFor()
  assert(await page.getByRole('button', { name: 'Keep accepted' }).evaluate(element => element === document.activeElement), 'Unsafe decline focus')
  await layout('decline-confirmation', true); await page.getByRole('button', { name: 'Keep accepted' }).click()
  await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await page.getByRole('button', { name: 'Confirm decline' }).click()
  await page.waitForURL(/view=invitations/); await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor()
  assert(!await page.getByText('PRIVATE_ROOM').count() && response === 'declined', 'Decline retained private UI')
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await page.waitForURL(/movie-nights\/12$/); await page.getByText('PRIVATE_ROOM', { exact: true }).waitFor()
  checks.push('Accepted decline has explicit safe confirmation; immediate private removal/navigation despite observer reset; declined reacceptance fetches fresh details')
  // Pending decline keeps the selected view/status/page URL and remains visible.
  response = 'pending'; await inbox(); await page.getByRole('button', { name: 'Decline invitation', exact: true }).click(); await page.getByText('RSVP: Declined', { exact: true }).waitFor()
  assert(new URL(page.url()).search === '?view=invitations&status=scheduled&page=1', 'RSVP changed dashboard URL state')
  checks.push('Pending decline preserves inbox URL/filter/page and keeps responded invitation visible')
  response = 'pending'; await go('/movie-nights?status=scheduled&page=1'); await page.getByText('No movie nights with this status.', { exact: true }).waitFor()
  assert(!await page.getByRole('button', { name: 'Decline invitation', exact: true }).count(), 'Pending invitation appeared in My nights')
  response = 'accepted'; await go('/movie-nights?status=scheduled&page=1'); await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await page.getByRole('button', { name: 'Confirm decline' }).click(); await page.getByText('No movie nights with this status.', { exact: true }).waitFor()
  assert(new URL(page.url()).search === '?status=scheduled&page=1', 'My nights RSVP changed URL')
  await page.getByRole('link', { name: 'Invitations', exact: true }).click(); await page.getByText('RSVP: Declined', { exact: true }).waitFor()
  checks.push('My nights excludes pending invitations; accepted decline removes its card, preserves URL state and appears in Invitations')
  for (const reason of ['restriction', 'lifecycle', 'deadline', 'access']) {
    response = 'accepted'; account = 'active'; status = 'scheduled'; allowed = true; start = reason === 'deadline' ? new Date(Date.now() + 2000).toISOString() : '2030-07-16T18:00:00Z'
    await go('/movie-nights/12'); await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await page.waitForTimeout(200)
    if (reason === 'restriction') account = 'restricted'
    if (reason === 'lifecycle') status = 'cancelled'
    if (reason === 'access') allowed = false
    if (reason !== 'deadline') await refresh()
    await dialog().waitFor({ state: 'detached' })
    account = 'active'; status = 'scheduled'; allowed = true; start = '2030-07-16T18:00:00Z'
    if (reason === 'access') await page.reload(); else await refresh()
    await page.getByRole('button', { name: 'Change to declined', exact: true }).waitFor(); assert(!await dialog().count(), `${reason}: RSVP confirmation auto-reopened`)
  }
  failRsvp = 409; await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await page.getByRole('button', { name: 'Confirm decline' }).click(); await page.getByRole('alert').waitFor(); assert(response === 'accepted', 'Conflict fabricated decline'); failRsvp = 0
  for (const terminal of ['cancelled', 'finalized']) { status = terminal; await page.reload(); await page.getByText(`This movie night is ${terminal}.`, { exact: false }).waitFor(); assert(!await page.getByRole('button', { name: 'Change to declined', exact: true }).count(), 'Terminal RSVP enabled') }
  status = 'scheduled'; start = new Date(Date.now() + 2000).toISOString(); await page.reload(); await page.getByRole('button', { name: 'Change to declined', exact: true }).waitFor(); await page.waitForTimeout(2100); assert(!await page.getByRole('button', { name: 'Change to declined', exact: true }).count(), 'Deadline remained enabled'); start = '2030-07-16T18:00:00Z'
  checks.push('Four mounted RSVP confirmation loss/restoration cases; 409 conflict, terminal events and live deadline controls remain safe')
  owner = 9; response = 'pending'; account = 'active'; status = 'scheduled'; start = new Date(Date.now() + 2200).toISOString()
  await inbox(); await page.getByText('Details available after accepting.', { exact: true }).waitFor()
  await page.getByText('This invitation is closed. Private details are unavailable.', { exact: true }).waitFor()
  assert(!await page.getByRole('button', { name: 'Accept invitation', exact: true }).count(), 'Expired pending invitation remained actionable')
  response = 'declined'; status = 'cancelled'; start = '2030-07-16T18:00:00Z'; await page.reload(); await page.getByText('This invitation is closed. Private details are unavailable.', { exact: true }).waitFor()
  assert(!await page.getByRole('button', { name: 'Accept invitation', exact: true }).count() && !await page.getByRole('link', { name: 'View A seat', exact: false }).count(), 'Closed declined invitation exposed action or details')
  checks.push('Expired pending and terminal declined invitations stay minimal with honest closed wording and no RSVP controls')
  const rsvpCount = () => requests.filter(item => item.method === 'PUT' && item.path.endsWith('/rsvp')).length
  const beginHold = () => {
    let release
    heldRsvp = { started: false, promise: new Promise(resolve => { release = resolve }), release: () => release() }
    return heldRsvp
  }
  const waitForHold = async hold => {
    for (let i = 0; i < 100 && !hold.started; i++) await page.waitForTimeout(25)
    assert(hold.started, 'Held RSVP request did not reach the synthetic server')
  }
  const freshPending = async () => {
    owner = 9; response = 'pending'; account = 'active'; status = 'scheduled'; start = '2030-07-16T18:00:00Z'; allowed = true; slowRsvp = false; failRsvp = 0; heldRsvp = null
    await inbox(); await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor(); await page.waitForTimeout(200)
  }
  const losePermission = async cause => {
    if (cause === 'restriction') account = 'restricted'
    if (cause === 'lifecycle') status = 'cancelled'
    if (cause === 'deadline') start = '2020-01-01T00:00:00Z'
    await refresh(); await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor({ state: 'detached' })
  }
  const restorePermission = async () => {
    account = 'active'; status = 'scheduled'; start = '2030-07-16T18:00:00Z'
    await refresh(); await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor()
  }
  for (const cause of ['restriction', 'lifecycle', 'deadline']) {
    await freshPending(); failRsvp = 500
    await page.getByRole('button', { name: 'Decline invitation', exact: true }).click(); await page.getByRole('alert').waitFor()
    await losePermission(cause); await restorePermission()
    assert(!await page.getByRole('alert').count() && !await dialog().count(), `${cause}: old error or confirmation restored`)
    assert(await page.getByRole('button', { name: 'Accept invitation', exact: true }).isEnabled(), `${cause}: stale submission presentation`)
    stateCases.push(`failed RSVP / ${cause} / restoration`)
  }
  checks.push('Three mounted failed-RSVP error cleanup cases: restriction, lifecycle and deadline restoration')
  await freshPending(); failRsvp = 500; let hold = beginHold(), count = rsvpCount()
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await waitForHold(hold)
  await losePermission('restriction'); await restorePermission()
  assert(await page.getByRole('button', { name: 'Accept invitation', exact: true }).isDisabled(), 'Pending lock lost after presentation reset')
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).evaluate(element => element.click())
  assert(rsvpCount() === count + 1, 'Duplicate pending submission')
  hold.release(); heldRsvp = null; failRsvp = 0
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor(); await page.waitForTimeout(200)
  assert(await page.getByRole('button', { name: 'Accept invitation', exact: true }).isEnabled(), 'Unresolved busy presentation after failure')
  assert(!await page.getByRole('alert').count() && response === 'pending', 'Delayed failure restored error or changed membership')
  stateCases.push('delayed failure / restriction-restoration / duplicate lock')
  checks.push('Delayed failed RSVP cannot restore errors; restored controls remain locked until the original request settles')
  for (const outcome of ['accepted', 'declined']) {
    await freshPending(); hold = beginHold()
    await page.getByRole('button', { name: outcome === 'accepted' ? 'Accept invitation' : 'Decline invitation', exact: true }).click(); await waitForHold(hold)
    await losePermission('restriction'); hold.release(); heldRsvp = null
    await page.getByText(outcome === 'accepted' ? 'No pending or declined invitations.' : 'RSVP: Declined', { exact: true }).waitFor()
    assert(page.url().includes('view=invitations') && !await page.getByText('PRIVATE_ROOM').count(), `${outcome}: retired completion navigated or leaked details`)
    account = 'active'; await refresh(); await page.waitForTimeout(200)
    assert(!await page.getByRole('alert').count() && !await dialog().count() && page.url().includes('view=invitations'), `${outcome}: stale completion restored`)
    stateCases.push(`delayed successful ${outcome} / restriction / authoritative inbox reconciliation`)
  }
  checks.push('Delayed successful accept and decline reconcile the fresh server inbox without retired-state errors or private navigation')
  await freshPending(); response = 'accepted'; await go('/movie-nights/12')
  await page.getByText('PRIVATE_ROOM', { exact: true }).waitFor(); hold = beginHold()
  await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await page.getByRole('button', { name: 'Confirm decline' }).click(); await waitForHold(hold)
  account = 'restricted'; await refresh(); await page.getByText('Your account is restricted.', { exact: false }).waitFor(); await dialog().waitFor({ state: 'detached' })
  hold.release(); heldRsvp = null; await page.getByText('Movie night unavailable.', { exact: true }).waitFor()
  assert(page.url().endsWith('/12') && !await page.getByText('PRIVATE_ROOM').count() && !await page.getByRole('alert').count(), 'Retired private decline retained data or redirected')
  account = 'active'; await inbox(); await page.getByText('RSVP: Declined', { exact: true }).waitFor()
  stateCases.push('delayed successful private decline / restriction / immediate private purge without stale navigation')
  checks.push('A confirmed detail decline still purges private UI after permission loss, without restoring errors or navigating the retired UI')
  // Leaving and returning to the same URL retires the originating component, even though its URL matches again.
  await freshPending(); hold = beginHold(); const originatingUrl = page.url()
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await waitForHold(hold)
  await page.getByRole('link', { name: 'My Movie Nights', exact: true }).click(); await page.getByText('No movie nights with this status.', { exact: true }).waitFor()
  await page.goBack(); await page.getByRole('list', { name: 'Received invitations' }).waitFor()
  assert(page.url() === originatingUrl, 'Originating URL was not restored for the stale-navigation regression')
  hold.release(); heldRsvp = null; await page.getByText('No pending or declined invitations.', { exact: true }).waitFor()
  assert(page.url().includes('view=invitations') && !await page.getByText('PRIVATE_ROOM').count(), 'Unmounted origin completion navigated after return')
  stateCases.push('delayed success / leave and return / no stale navigation')
  checks.push('Leaving and returning to the originating UI suppresses stale navigation while reconciling a confirmed write')
  owner = 11; await go('/movie-nights/12'); await page.getByText('Movie night unavailable.', { exact: true }).waitFor(); assert(!await page.getByText('PRIVATE_ROOM').count(), 'Outsider private data')
  checks.push('Outsider direct detail is unavailable without participant data')
  owner = 9; response = 'pending'; slowRsvp = 6500; await inbox(); await page.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await page.waitForTimeout(5100); owner = 11; await refresh(); await page.getByText('@fixture_11', { exact: true }).waitFor(); await page.waitForTimeout(1600); assert(!await page.getByText('PRIVATE_ROOM').count() && !page.url().endsWith('/12'), 'Late RSVP crossed accounts')
  checks.push('Account switch during delayed successful RSVP suppresses private completion and navigation')
  owner = 9; response = 'pending'; slowRsvp = true; await inbox(); await page.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForTimeout(1100); assert(!await page.getByText('PRIVATE_ROOM').count(), 'Late RSVP restored logout private data')
  checks.push('Logout during pending RSVP suppresses late private completion')
  assert(unexpected.length === 0, unexpected.join('; ')); assert(errors.length === 0, errors.join('; '))
  return { checks, geometry, stateCases, requests: requests.length, writes: requests.filter(item => ['POST', 'PUT'].includes(item.method)), unexpectedRequests: unexpected, pageErrors: errors }
}
