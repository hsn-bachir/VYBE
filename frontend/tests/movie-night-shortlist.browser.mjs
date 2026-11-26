// Synthetic Core/Catalog DTOs only. Blocks external HTTP and never touches real accounts or records.
export async function runMovieNightShortlistChecks(page, base = 'http://127.0.0.1:5187', screenshots) {
  const checks = [], geometry = [], requests = [], errors = [], unexpected = [], permissionCases = []
  const assert = (value, message) => { if (!value) throw new Error(message) }
  page.on('pageerror', error => errors.push(error.message))
  let owner = 7, account = 'active', rsvp = 'accepted', status = 'scheduled', startsAt = '2030-07-16T18:00:00Z', access = true
  let failShortlist = false, failTotals = false, probeFailure = null, probeArmed = false
  let metadata = true, failSearch = false, failNominate = 0, failRemove = 0, failVote = 0, slowSearch = false, hold = null, nextId = 2000, capacity = false
  const host = { id: 7, username: 'cinema_host', avatar_url: null }, guest = { id: 9, username: 'cinema_guest_with_long_name', avatar_url: null }
  const movie = id => ({ tmdb_id: id, title: id === 550 ? 'A very long film title for a shared cinematic evening '.repeat(2) : `A shared film ${id}`, poster_path: null, backdrop_path: null, overview: 'A synthetic movie summary.', release_date: '2020-07-16', tmdb_rating: 7.5, tmdb_vote_count: 100 })
  const initial = Array.from({ length: 13 }, (_, i) => ({ id: 1000 + i, tmdb_id: 550 + i, nominated_by: host, created_at: '2026-11-01T10:00:00Z' }))
  let entries = initial.map(item => ({ ...item }))
  const votes = new Map()
  const open = () => status === 'scheduled' && Date.now() < Date.parse(startsAt)
  const member = () => access && (owner === 7 || owner === 9 && rsvp === 'accepted')
  const event = () => ({ id: 12, title: 'One night, many stories', host, starts_at: startsAt, timezone: 'Asia/Beirut', status, my_rsvp: owner === 7 ? 'accepted' : rsvp, voting_open: open(), finalized_tmdb_id: null, finalized_at: null, cancelled_at: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' })
  const totals = () => {
    const rows = entries.map(item => ({ movie_night_movie_id: item.id, tmdb_id: item.tmdb_id, votes: [...votes.values()].filter(id => id === item.id).length }))
    const max = Math.max(0, ...rows.map(row => row.votes))
    return { totals: rows, my_vote: votes.get(owner) ?? null, total_votes: rows.reduce((n, row) => n + row.votes, 0), leaders: max ? rows.filter(row => row.votes === max).map(row => row.tmdb_id) : [], voting_open: open() }
  }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' }
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method()
    const body = req.postData() ? req.postDataJSON() : undefined
    const reply = (json, code = 200) => route.fulfill({ status: code, headers, json })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push({ path, method, query: url.search, body, owner, rsvp })
    if (path === '/api/v1/auth/me') return owner ? reply({ data: { ...(owner === 7 ? host : guest), id: owner, email: 'fake@example.test', email_verified_at: '2026-01-01T00:00:00Z' } }) : reply({}, 401)
    if (path === '/api/v1/me/access') return reply({ data: { role: 'user', account_status: account } })
    if (path === '/api/v1/auth/logout') { owner = 0; return reply({}) }
    if (path === '/api/v1/movies/search') {
      const q = url.searchParams.get('query'), p = Number(url.searchParams.get('page'))
      if (slowSearch && q === 'old') await new Promise(resolve => setTimeout(resolve, 800))
      if (failSearch) return reply({ message: 'SQL SECRET' }, 503)
      return reply({ data: q === 'none' ? [] : q === 'old' ? [{ ...movie(999), title: 'Stale search result' }] : p === 2 ? [movie(702)] : [movie(550), movie(700), movie(701)], meta: { page: p, total_pages: 2, total_results: 4 } })
    }
    if (path.startsWith('/api/v1/movies/')) return reply({ data: [], meta: { page: 1, total_pages: 0, total_results: 0 } })
    if (path === '/api/v1/me/movie-nights' || path === '/api/v1/me/movie-nights/invitations') {
      const summary = event(), minimal = { id: 12, title: summary.title, host, starts_at: startsAt, timezone: 'Asia/Beirut', status, my_rsvp: rsvp }
      const item = rsvp === 'accepted' || owner === 7 ? summary : minimal
      const inbox = path.endsWith('invitations'), p = Number(url.searchParams.get('page') || 1), per = Number(url.searchParams.get('per_page') || 12)
      const items = inbox ? owner === 9 && rsvp !== 'accepted' ? [{ id: 90, participant: guest, rsvp_status: rsvp, responded_at: null, movie_night: item }] : [] : owner === 7 || owner === 9 && rsvp === 'accepted' ? [item] : []
      const filtered = !inbox && url.searchParams.has('status') ? items.filter(entry => entry.status === url.searchParams.get('status')) : items
      return reply({ data: filtered.slice((p - 1) * per, p * per), meta: { page: p, per_page: per, total_pages: Math.ceil(filtered.length / per), total_results: filtered.length } })
    }
    if (path === '/api/v1/me/movie-nights/12') {
      if (probeArmed && probeFailure) return probeFailure === 'network' ? route.abort('failed') : reply({ message: 'SQL SECRET' }, 503)
      return member() ? reply({ data: { ...event(), location: 'PRIVATE_ROOM', meeting_url: null } }) : reply({}, 404)
    }
    if (path.endsWith('/12/invitations') && method === 'GET') return owner === 7 ? reply({ data: [], meta: { page: 1, per_page: 12, total_pages: 0, total_results: 0 } }) : reply({}, 403)
    if (path.endsWith('/12/rsvp') && method === 'PUT') { rsvp = body.rsvp_status; if (rsvp === 'declined') votes.delete(owner); return reply({ data: { id: 90, participant: guest, rsvp_status: rsvp, responded_at: '2026-11-26T12:00:00Z' } }) }
    if (path.endsWith('/12/movies') && method === 'GET') {
      if (!member()) return reply({}, 404)
      if (failShortlist) return reply({ message: 'SQL SECRET' }, 503)
      const p = Number(url.searchParams.get('page') || 1), per = Number(url.searchParams.get('per_page') || 12)
      return reply({ data: entries.slice((p - 1) * per, p * per).map(item => ({ ...item, movie: metadata ? movie(item.tmdb_id) : null })), meta: { page: p, per_page: per, total_pages: Math.ceil(entries.length / per), total_results: capacity ? 50 : entries.length, metadata_unavailable: !metadata } })
    }
    if (path.endsWith('/12/votes') && method === 'GET') return member() ? failTotals ? reply({ message: 'SQL SECRET' }, 503) : reply({ data: totals() }) : reply({}, 404)
    if (path.endsWith('/12/movies') && method === 'POST') {
      if (!member()) return reply({}, 404)
      const failed = failNominate
      if (hold) { const job = hold; job.started = true; await job.promise }
      if (failed) return reply(failed === 404 ? { code: 'MOVIE_NOT_FOUND' } : failed === 422 ? { errors: { tmdb_id: ['Choose a valid movie.'] } } : { message: 'SQL SECRET', code: 'UPSTREAM_UNAVAILABLE' }, failed)
      if (entries.some(item => item.tmdb_id === body.tmdb_id) || entries.length >= 50) return reply({}, 409)
      const entry = { id: nextId++, tmdb_id: body.tmdb_id, nominated_by: owner === 7 ? host : guest, created_at: '2026-11-26T12:00:00Z' }
      entries.push(entry); return reply({ data: { ...entry, movie: movie(entry.tmdb_id) } }, 201)
    }
    if (/\/12\/movies\/\d+$/.test(path) && method === 'DELETE') {
      if (!member()) return reply({}, 404)
      const id = Number(path.split('/').at(-1)), item = entries.find(entry => entry.id === id)
      const removalFailure = failRemove
      if ([403, 404].includes(removalFailure) && probeFailure) probeArmed = true
      if (hold) { const job = hold; job.started = true; await job.promise }
      if (removalFailure) { if (removalFailure === 409) votes.set(99, id); return reply({}, removalFailure) }
      if (!item) return reply({}, 404)
      if (failRemove || [...votes.values()].includes(id)) { if (failRemove === 409) votes.set(99, id); return reply({}, failRemove || 409) }
      if (owner !== 7 && item.nominated_by.id !== owner) return reply({}, 403)
      entries = entries.filter(entry => entry.id !== id); return route.fulfill({ status: 204, headers })
    }
    if (path.endsWith('/12/vote') && method === 'PUT') {
      if (!member()) return reply({}, 404)
      const failed = failVote, voter = owner, delayed = hold
      if (delayed) {
        if (!failed) votes.set(voter, body.movie_night_movie_id)
        delayed.started = true; await delayed.promise
      }
      if (failed) return reply({}, failed)
      if (!entries.some(entry => entry.id === body.movie_night_movie_id)) return reply({}, 404)
      if (!delayed) votes.set(voter, body.movie_night_movie_id)
      return reply({ data: { movie_night_movie_id: body.movie_night_movie_id, updated_at: '2026-11-26T12:00:00Z' } })
    }
    unexpected.push(`${method} ${path}`); return reply({}, 404)
  })
  const refresh = () => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const dialog = () => page.getByRole('dialog')
  const candidate = id => page.locator(`.night-candidate[data-candidate-id="${id}"]`)
  const go = async (id = 7) => { owner = id; await page.goto(`${base}/movie-nights/12`); if (member()) await page.getByRole('list', { name: 'Shared movie shortlist' }).waitFor(); else await page.getByText('Movie night unavailable.', { exact: true }).waitFor() }
  const waitIdle = async () => { await page.waitForTimeout(200) }
  const nomination = async (q = 'film') => { await page.getByRole('button', { name: 'Nominate a movie', exact: true }).click(); await page.getByLabel('Search movie title', { exact: true }).fill(q); await page.getByRole('list', { name: 'Movie search results' }).waitFor() }
  const layout = async (state, modal = false) => {
    for (const width of [390, 768, 1024, 1440]) {
      if (!modal) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0))
      if (modal) await dialog().evaluate(el => { el.scrollTop = 0 })
      await page.waitForTimeout(150)
      const boxes = await page.evaluate(modal => {
        const root = document.querySelector(modal ? 'dialog' : '.movie-nights-page'), rect = root.getBoundingClientRect()
        return { overflow: document.documentElement.scrollWidth > innerWidth || root.scrollWidth > root.clientWidth, left: rect.left, right: rect.right, top: rect.top, header: document.querySelector('.app-header').getBoundingClientRect().bottom,
          cards: [...root.querySelectorAll('.movie-card')].map(el => { const p = el.querySelector('.movie-poster').getBoundingClientRect(), r = el.getBoundingClientRect(); return { left: r.left, right: r.right, ratio: p.width / p.height } }) }
      }, modal)
      assert(!boxes.overflow && boxes.left >= 0 && boxes.right <= width + 1, `${state}/${width} overflow`)
      if (!modal) assert(boxes.top >= boxes.header, `${state}/${width} header overlap`)
      for (const box of boxes.cards) assert(box.left >= 0 && box.right <= width + 1 && Math.abs(box.ratio - 2/3) < .02, `${state}/${width} poster geometry`)
      geometry.push({ state, width, overflow: boxes.overflow, cards: boxes.cards.length })
      if (screenshots) await page.screenshot({ path: `${screenshots}/${state}-${width}.png`, fullPage: !modal })
    }
  }
  await go(); await waitIdle()
  await page.getByText('No votes yet.', { exact: false }).waitFor()
  assert(await candidate(1000).count() === 1 && await candidate(1012).count() === 0, 'Incorrect shortlist page')
  await layout('host-shortlist')
  await page.getByRole('navigation', { name: 'Shortlist pages' }).getByRole('button', { name: 'Next' }).click(); await candidate(1012).waitFor()
  await page.getByRole('navigation', { name: 'Shortlist pages' }).getByRole('button', { name: 'Previous' }).click(); await candidate(1000).waitFor()
  checks.push('Host shortlist, no-votes state, paginated Core candidates, global server totals, long titles and stable poster placeholders')
  entries = []; await refresh(); await page.getByText('Every great night starts with a suggestion.', { exact: true }).waitFor()
  entries = initial.map(item => ({ ...item })); failShortlist = true; await refresh(); await page.getByText('Shortlist unavailable.', { exact: true }).waitFor()
  failShortlist = false; await page.locator('.night-shortlist').getByRole('button', { name: 'Try again' }).click(); await candidate(1000).waitFor()
  failTotals = true; await refresh(); await page.getByText('Voting results unavailable.', { exact: true }).waitFor(); assert(!await candidate(1000).getByRole('button', { name: 'Remove', exact: false }).count(), 'Missing totals assumed zero votes')
  failTotals = false; await page.locator('.night-voting').getByRole('button', { name: 'Try again' }).click(); await candidate(1000).getByRole('button', { name: 'Remove', exact: false }).waitFor()
  checks.push('Empty shortlist and independent shortlist/vote errors recover by retry; missing totals never imply zero-vote removal')
  await nomination(); assert(await dialog().getByRole('button', { name: 'Already nominated', exact: false }).count() === 1, 'Duplicate nomination not marked')
  await layout('nomination-search', true)
  await page.getByRole('navigation', { name: 'Movie search pages' }).getByRole('button', { name: 'Next' }).click(); await dialog().getByRole('button', { name: 'Nominate A shared film 702' }).waitFor()
  await page.getByLabel('Search movie title', { exact: true }).fill('none'); await dialog().getByText('No movies match this title.').waitFor()
  slowSearch = true; await page.getByLabel('Search movie title', { exact: true }).fill('old'); await page.waitForTimeout(400); await page.getByLabel('Search movie title', { exact: true }).fill('new'); await page.getByRole('list', { name: 'Movie search results' }).waitFor(); await page.waitForTimeout(850); assert(!await page.getByText('Stale search result').count(), 'Stale search results')
  failSearch = true; await page.getByLabel('Search movie title', { exact: true }).fill('error'); await dialog().getByText('Movie search unavailable.').waitFor(); failSearch = false; await dialog().getByRole('button', { name: 'Try again' }).click(); await page.getByRole('list', { name: 'Movie search results' }).waitFor()
  checks.push('Debounced movie search, prefix/page isolation, empty results, old response suppression, error/retry and already-nominated state')
  for (const code of [422, 503, 404]) { failNominate = code; await dialog().getByRole('button', { name: 'Nominate A shared film 700' }).click(); await dialog().getByRole('alert').waitFor(); assert(!await page.getByText('SQL SECRET').count(), 'Unsafe nomination error'); assert(await page.getByText('PRIVATE_ROOM', { exact: true }).count() === 1, 'Movie failure revoked event') }
  failNominate = 0; const beforeNomination = requests.filter(item => item.method === 'POST' && item.path.endsWith('/movies')).length
  await dialog().getByRole('button', { name: 'Nominate A shared film 700' }).dblclick(); await dialog().waitFor({ state: 'detached' }); await waitIdle()
  assert(requests.filter(item => item.method === 'POST' && item.path.endsWith('/movies')).length === beforeNomination + 1, 'Duplicate nomination')
  assert(entries.some(item => item.id === 2000 && item.tmdb_id === 700), 'TMDB nomination contract')
  checks.push('Nomination validation/outage/MOVIE_NOT_FOUND recovery preserves membership; exact TMDB body and duplicate protection; authoritative refresh')
  await candidate(1000).getByRole('button', { name: 'Vote for movie', exact: false }).click(); await candidate(1000).getByRole('button', { pressed: true }).waitFor()
  failVote = 503; await candidate(1001).getByRole('button', { name: 'Change vote', exact: false }).click(); await page.locator('.night-shortlist').getByRole('alert').waitFor(); assert(await candidate(1000).getByRole('button', { pressed: true }).count() === 1, 'Failed vote changed selection')
  failVote = 0; await candidate(1001).getByRole('button', { name: 'Change vote', exact: false }).dblclick(); await candidate(1001).getByRole('button', { pressed: true }).waitFor()
  assert(votes.get(7) === 1001 && !await candidate(1001).getByRole('button', { name: 'Remove', exact: false }).count(), 'Core vote ID or removal eligibility')
  checks.push('First vote/switch use Core candidate IDs, server-confirmed selection, failed change preservation and no removal of voted candidates')
  await candidate(1002).getByRole('button', { name: 'Remove', exact: false }).click(); await dialog().waitFor(); assert(await dialog().getByRole('button', { name: 'Keep movie' }).evaluate(el => el === document.activeElement), 'Unsafe removal focus')
  await layout('removal-confirmation', true); await dialog().getByRole('button', { name: 'Keep movie' }).click()
  await candidate(1002).getByRole('button', { name: 'Remove', exact: false }).click(); failRemove = 503; await dialog().getByRole('button', { name: 'Confirm removal' }).click(); await dialog().getByRole('alert').waitFor(); assert(entries.some(item => item.id === 1002), 'Failed removal lost candidate')
  failRemove = 0; await dialog().getByRole('button', { name: 'Confirm removal' }).click(); await dialog().waitFor({ state: 'detached' }); await candidate(1002).waitFor({ state: 'detached' })
  await candidate(1003).getByRole('button', { name: 'Remove', exact: false }).click(); failRemove = 409; await dialog().getByRole('button', { name: 'Confirm removal' }).click(); await dialog().waitFor({ state: 'detached' }); await waitIdle(); assert(entries.some(item => item.id === 1003) && !await candidate(1003).getByRole('button', { name: 'Remove', exact: false }).count(), 'Concurrent vote/removal conflict misrepresented'); failRemove = 0; votes.delete(99)
  checks.push('Explicit removal, safe focus/keep, failed removal preservation, Core deletion ID and concurrent voted-candidate conflict reconciliation')
  await go(9); await waitIdle(); assert(!await candidate(1000).getByRole('button', { name: 'Remove', exact: false }).count(), 'Guest can remove host candidate')
  await nomination(); await dialog().getByRole('button', { name: 'Nominate A shared film 701' }).click(); await dialog().waitFor({ state: 'detached' }); await waitIdle()
  await page.getByRole('navigation', { name: 'Shortlist pages' }).getByRole('button', { name: 'Next' }).click(); await candidate(2001).getByRole('button', { name: 'Remove', exact: false }).waitFor()
  assert(!await candidate(2000).getByRole('button', { name: 'Remove', exact: false }).count(), 'Guest could remove another nomination')
  await candidate(2001).getByRole('button', { name: 'Remove', exact: false }).click(); await dialog().getByRole('button', { name: 'Confirm removal' }).click(); await candidate(2001).waitFor({ state: 'detached' })
  await page.getByRole('navigation', { name: 'Shortlist pages' }).getByRole('button', { name: 'Previous' }).click(); await candidate(1000).waitFor()
  checks.push('Accepted guest can nominate and remove their own zero-vote candidate while another nominator stays protected')
  await candidate(1000).getByRole('button', { name: 'Vote for movie', exact: false }).click(); await candidate(1000).getByRole('button', { pressed: true }).waitFor(); await page.getByText('Tied leaders:', { exact: false }).waitFor()
  checks.push('Guest voting, ownership boundary and authoritative tied leaders by TMDB ID without voter identities')
  metadata = false; await refresh(); await page.getByText('Movie metadata is unavailable.', { exact: false }).waitFor(); await layout('metadata-fallback')
  await candidate(1001).getByRole('button', { name: 'Change vote', exact: false }).click(); await candidate(1001).getByRole('button', { pressed: true }).waitFor(); assert(votes.get(9) === 1001, 'Metadata outage blocked vote')
  metadata = true; await go(9); await waitIdle()
  await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await dialog().getByRole('button', { name: 'Confirm decline' }).click(); await page.waitForURL(/view=invitations/); await page.getByText('RSVP: Declined', { exact: true }).waitFor()
  assert(!await page.getByRole('list', { name: 'Shared movie shortlist' }).count() && !votes.has(9), 'Decline retained private vote/shortlist')
  await go(7); await waitIdle(); assert((await page.locator('.night-tally').innerText()).includes('1 total valid vote'), 'Host totals did not reflect declined vote')
  owner = 9; await page.goto(`${base}/movie-nights?view=invitations`); await page.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await page.waitForURL(/movie-nights\/12$/); await page.getByRole('list', { name: 'Shared movie shortlist' }).waitFor(); await page.getByText('You haven’t voted yet.', { exact: true }).waitFor(); assert(!votes.has(9), 'Reaccept restored old vote')
  checks.push('Metadata failure preserves voting; decline immediately removes private UI/vote, host sees fresh totals, reaccept fetches fresh data without prior vote')
  for (const reason of ['restriction', 'deadline', 'lifecycle', 'access']) {
    owner = 7; account = 'active'; status = 'scheduled'; access = true; startsAt = reason === 'deadline' ? new Date(Date.now() + 2200).toISOString() : '2030-07-16T18:00:00Z'
    await go(); await nomination('sensitive search'); await waitIdle()
    const cachedTally = await page.locator('.night-tally').innerText()
    const voteReads = requests.filter(item => item.method === 'GET' && item.path.endsWith('/12/votes')).length
    if (reason === 'restriction') account = 'restricted'
    if (reason === 'lifecycle') status = 'cancelled'
    if (reason === 'access') access = false
    if (reason !== 'deadline') await refresh()
    await dialog().waitFor({ state: 'detached' })
    if (reason === 'deadline') {
      await page.locator('.night-tally').getByText('Voting closed', { exact: false }).waitFor()
      const closedTally = await page.locator('.night-tally').innerText()
      assert(cachedTally.includes('Voting open'), 'Deadline case did not start with cached open totals')
      assert(closedTally.replace('Voting closed', 'Voting state') === cachedTally.replace('Voting open', 'Voting state'), 'Deadline changed counts, selection or provisional leaders')
      assert(requests.filter(item => item.method === 'GET' && item.path.endsWith('/12/votes')).length === voteReads, 'Deadline label required a vote refetch')
    }
    account = 'active'; status = 'scheduled'; access = true; startsAt = '2030-07-16T18:00:00Z'
    if (reason === 'access') await page.reload(); else await refresh()
    await page.getByRole('button', { name: 'Nominate a movie', exact: true }).waitFor(); assert(!await dialog().count(), 'Permission restoration reopened nomination')
    await page.getByRole('button', { name: 'Nominate a movie', exact: true }).click(); assert(await page.getByLabel('Search movie title', { exact: true }).inputValue() === '', 'Search draft restored'); await page.keyboard.press('Escape'); permissionCases.push({ dialog: 'nomination', reason })
  }
  checks.push('Four mounted nomination permission loss/restoration cases clear search, close dialogs and require explicit fresh reopen')
  checks.push('Cached open voting summary closes at the deadline without refresh, preserving totals, caller selection and leaders')
  // Removal permission must close an already mounted confirmation and never resurrect it.
  for (const reason of ['restriction', 'lifecycle', 'votes']) {
    account = 'active'; status = 'scheduled'; access = true; startsAt = '2030-07-16T18:00:00Z'; votes.delete(99)
    await go(7); await waitIdle(); await candidate(1004).getByRole('button', { name: 'Remove', exact: false }).click(); await dialog().waitFor()
    if (reason === 'restriction') account = 'restricted'
    if (reason === 'lifecycle') status = 'cancelled'
    if (reason === 'votes') votes.set(99, 1004)
    await refresh(); await dialog().waitFor({ state: 'detached' })
    account = 'active'; status = 'scheduled'; votes.delete(99); await refresh(); await candidate(1004).getByRole('button', { name: 'Remove', exact: false }).waitFor()
    assert(!await dialog().count(), `${reason}: removal confirmation reopened`); permissionCases.push({ dialog: 'removal', reason })
  }
  checks.push('Three mounted removal permission restoration cases: restriction, lifecycle and newly voted candidate')
  const beginHold = () => { let release; hold = { started: false, promise: new Promise(resolve => { release = resolve }), release: () => release() }; return hold }
  const started = async job => { for (let i = 0; i < 100 && !job.started; i++) await page.waitForTimeout(25); assert(job.started, 'Held write did not start') }
  for (const failure of [0, 503]) {
    account = 'active'; status = 'scheduled'; await go(7); await nomination('a sensitive film')
    let job = beginHold(); failNominate = failure
    const before = requests.filter(item => item.method === 'POST' && item.path.endsWith('/movies')).length
    await dialog().getByRole('button', { name: 'Nominate A shared film 701' }).click(); await started(job)
    account = 'restricted'; await refresh(); await dialog().waitFor({ state: 'detached' }); account = 'active'; await refresh()
    const trigger = page.getByRole('button', { name: 'Nominate a movie', exact: true }); await trigger.waitFor(); assert(await trigger.isDisabled(), 'Pending nomination lock lost on restoration')
    await trigger.evaluate(el => el.click()); assert(requests.filter(item => item.method === 'POST' && item.path.endsWith('/movies')).length === before + 1, 'Duplicate held nomination')
    job.release(); hold = null; failNominate = 0; await waitIdle(); await page.waitForTimeout(150)
    assert(!await page.locator('.night-shortlist').getByRole('alert').count() && !await dialog().count(), 'Retired nomination restored an error/dialog')
    await trigger.click(); assert(await page.getByLabel('Search movie title', { exact: true }).inputValue() === '', 'Retired search restored'); await page.keyboard.press('Escape')
    if (failure === 0) entries = entries.filter(item => item.tmdb_id !== 701)
  }
  checks.push('Held successful/failed nominations preserve request locks through restriction/restoration and reconcile without stale errors or search drafts')
  account = 'active'; status = 'scheduled'; await go(7); await waitIdle()
  let removalHold = beginHold(); failRemove = 503
  await candidate(1004).getByRole('button', { name: 'Remove', exact: false }).click(); await dialog().getByRole('button', { name: 'Confirm removal' }).click(); await started(removalHold)
  votes.set(99, 1004); await refresh(); await dialog().waitFor({ state: 'detached' }); votes.delete(99); await refresh()
  await candidate(1004).getByRole('button', { name: 'Remove', exact: false }).waitFor(); assert(await candidate(1004).getByRole('button', { name: 'Remove', exact: false }).isDisabled(), 'Removal lock lost during candidate permission restoration')
  removalHold.release(); hold = null; failRemove = 0; await page.waitForTimeout(250)
  assert(!await page.locator('.night-shortlist').getByRole('alert').count() && !await dialog().count() && entries.some(item => item.id === 1004), 'Retired removal restored an error/dialog or lost its candidate')
  checks.push('Candidate-specific permission loss/restoration retires a held removal failure while preserving its request lock and candidate')
  account = 'active'; await go(7); await waitIdle(); let job = beginHold(); failVote = 503
  await candidate(1000).getByRole('button', { name: 'Change vote', exact: false }).click(); await started(job)
  account = 'restricted'; await refresh(); await candidate(1000).getByRole('button', { name: 'Change vote', exact: false }).waitFor({ state: 'detached' }); account = 'active'; await refresh()
  await candidate(1000).getByRole('button', { name: 'Change vote', exact: false }).waitFor(); assert(await candidate(1000).getByRole('button', { name: 'Change vote', exact: false }).isDisabled(), 'Vote lock lost')
  job.release(); hold = null; failVote = 0; await page.waitForTimeout(250); assert(!await page.locator('.night-shortlist').getByRole('alert').count() && votes.get(7) === 1001, 'Retired failed vote restored error/selection')
  checks.push('Held vote failure retains the last server selection and suppresses stale errors while conflicting controls remain locked')
  // A transport-completing vote after a successful decline must not resurrect private results.
  await go(9); await waitIdle(); job = beginHold(); const beforeVote = votes.get(9)
  await candidate(1000).getByRole('button', { name: beforeVote ? 'Change vote' : 'Vote for movie', exact: false }).click(); await started(job)
  await page.getByRole('button', { name: 'Change to declined', exact: true }).click(); await dialog().getByRole('button', { name: 'Confirm decline' }).click(); await page.waitForURL(/view=invitations/)
  job.release(); hold = null; await page.waitForTimeout(250); assert(!await page.getByRole('list', { name: 'Shared movie shortlist' }).count(), 'Late vote restored private UI'); assert(!votes.has(9), 'Decline failed to remove the committed vote')
  checks.push('A late pending vote cannot restore private shortlist/selection after decline')
  for (const terminal of ['cancelled', 'finalized']) { status = terminal; await go(7); assert(!await page.getByRole('button', { name: 'Nominate a movie', exact: true }).count() && !await candidate(1000).getByRole('button', { name: /Vote|Remove/ }).count(), 'Terminal mutation controls') }
  status = 'scheduled'; account = 'restricted'; await go(7); assert(!await page.getByRole('button', { name: 'Nominate a movie', exact: true }).count(), 'Restricted mutation control'); account = 'active'
  capacity = true; await go(7); assert(await page.getByRole('button', { name: 'Nominate a movie', exact: true }).isDisabled(), '50-candidate limit ignored'); capacity = false
  checks.push('Cancelled/finalized/restricted read-only access and authoritative 50-candidate limit')
  for (const failure of [503, 'network']) {
    owner = 7; account = 'active'; status = 'scheduled'; access = true; rsvp = 'accepted'; startsAt = '2030-07-16T18:00:00Z'
    await go(7); await waitIdle(); await candidate(1004).getByRole('button', { name: 'Remove', exact: false }).click()
    failRemove = 404; probeFailure = failure; probeArmed = false
    const before = requests.filter(item => item.method === 'DELETE').length
    await dialog().getByRole('button', { name: 'Confirm removal' }).click(); await page.getByText('Movie night unavailable.', { exact: true }).waitFor()
    assert(!await page.getByText('PRIVATE_ROOM', { exact: true }).count() && !await page.getByRole('list', { name: 'Shared movie shortlist' }).count(), `${failure}: unverifiable probe retained private UI`)
    assert(requests.filter(item => item.method === 'DELETE').length === before + 1, 'Probe failure retried the mutation')
    failRemove = 0; probeFailure = null; probeArmed = false
    const detailReads = requests.filter(item => item.method === 'GET' && item.path === '/api/v1/me/movie-nights/12').length
    await page.getByRole('link', { name: 'Return to Movie Nights', exact: true }).click()
    await page.getByRole('link', { name: 'View One night, many stories', exact: true }).click()
    await page.getByText('PRIVATE_ROOM', { exact: true }).waitFor(); await candidate(1004).waitFor()
    assert(requests.filter(item => item.method === 'GET' && item.path === '/api/v1/me/movie-nights/12').length > detailReads, 'Recovery reused the revoked detail instead of a fresh authorized read')
  }
  checks.push('Temporary 503/network access-probe failures purge private UI without mutation retry; explicit return navigation retrieves fresh authorized details and shortlist')
  const privateCount = () => requests.filter(item => /\/12\/(movies|votes)$/.test(item.path) && item.owner !== 7).length
  for (const state of ['pending', 'declined', 'outsider']) { rsvp = state === 'outsider' ? 'accepted' : state; const count = privateCount(); await go(state === 'outsider' ? 11 : 9); assert(privateCount() === count, `${state} fetched private shortlist/totals`) }
  rsvp = 'accepted'; await go(7); await nomination(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByLabel('Search movie title', { exact: true }).focus(); await page.keyboard.press('Shift+Tab'); assert(await dialog().evaluate(el => el.contains(document.activeElement)), 'Dialog focus escaped'); await page.keyboard.press('Escape')
  for (const change of ['switch', 'logout']) {
    owner = 7; rsvp = 'accepted'; account = 'active'; status = 'scheduled'; access = true; startsAt = '2030-07-16T18:00:00Z'
    await go(7); await waitIdle(); job = beginHold()
    const target = votes.get(7) === 1000 ? 1001 : 1000
    await candidate(target).getByRole('button', { name: 'Change vote', exact: false }).click(); await started(job)
    if (change === 'switch') { await page.waitForTimeout(5100); owner = 11; await refresh(); await page.getByText('Movie night unavailable.', { exact: true }).waitFor() }
    else { await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForURL(base + '/') }
    job.release(); hold = null; await page.waitForTimeout(250)
    assert(!await page.getByRole('list', { name: 'Shared movie shortlist' }).count() && !await page.getByText('PRIVATE_ROOM', { exact: true }).count(), `${change}: pending vote restored private data`)
  }
  checks.push('Account switch and logout retire mounted pending vote consumers and reject late private completions')
  assert(!requests.some(item => item.path.endsWith('/finalize')), 'Finalization implemented')
  assert(!requests.some(item => /^\/api\/v1\/movies\/\d+/.test(item.path)), 'Per-movie metadata request')
  checks.push('Pending/declined/outsider exclusion, keyboard/reduced-motion dialog access, no per-candidate metadata fetches or finalization')
  assert(errors.length === 0, errors.join('; ')); assert(unexpected.length === 0, unexpected.join('; '))
  return { checks, geometry, permissionCases, requests: requests.length, writes: requests.filter(item => ['POST', 'PUT', 'DELETE'].includes(item.method)), pageErrors: errors, unexpectedRequests: unexpected }
}
