// Synthetic transport only: never uses operator accounts, records, Catalog or TMDB.
export async function runMovieNightFinalizationChecks(page, base = 'http://127.0.0.1:5187', screenshots) {
  const checks = [], geometry = [], requests = [], errors = [], unexpected = []
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  page.on('pageerror', error => errors.push(error.message))
  let owner = 7, account = 'active', status = 'scheduled', rsvp = 'accepted', starts = '2030-07-16T18:00:00Z', accessible = true
  let leaders = [550], count = 2, winner = null, metadata = true, failMetadata = false, failTotals = false, failure = null, hold = null, reconciliationFailure = null
  const host = { id: 7, username: 'cinema_host', avatar_url: null }, guest = { id: 9, username: 'cinema_guest', avatar_url: null }
  const movie = id => ({ tmdb_id: id, title: id === 550 ? 'The chosen film with a beautifully long cinematic title' : `Authoritative film ${id}`, poster_path: null, backdrop_path: null, overview: null, release_date: '2020-01-01', tmdb_rating: 8.4, tmdb_vote_count: 100 })
  const entries = [550, 551, 552].map((id, i) => ({ id: 1000 + i, tmdb_id: id, nominated_by: host, created_at: '2026-01-01T00:00:00Z' }))
  const member = () => accessible && (owner === 7 || owner === 9 && rsvp === 'accepted')
  const event = () => ({ id: 12, title: 'The final shared screening', host, starts_at: starts, timezone: 'Asia/Beirut', status, my_rsvp: owner === 7 ? 'accepted' : rsvp, voting_open: status === 'scheduled' && Date.now() < Date.parse(starts), finalized_tmdb_id: winner, finalized_at: winner ? '2026-11-26T18:00:00Z' : null, cancelled_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-11-26T18:00:00Z' })
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' }
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method(), body = req.postData() ? req.postDataJSON() : undefined
    const reply = (json, code = 200) => route.fulfill({ status: code, headers, json })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push({ path, method, body, query: url.search })
    if (path === '/api/v1/auth/me') return owner ? reply({ data: { ...(owner === 7 ? host : guest), id: owner, email: 'fake@example.test', email_verified_at: '2026-01-01T00:00:00Z' } }) : reply({}, 401)
    if (path === '/api/v1/auth/logout') { owner = 0; return reply({}) }
    if (path === '/api/v1/me/access') return reply({ data: { role: 'user', account_status: account } })
    if (/^\/api\/v1\/movies\/\d+$/.test(path)) return failMetadata ? reply({}, 503) : reply({ data: { ...movie(Number(path.split('/').at(-1))), original_title: null, runtime: null, original_language: null, genres: [] }, meta: { stale: false } })
    if (path.startsWith('/api/v1/movies/')) return reply({ data: [], meta: { page: 1, total_pages: 0, total_results: 0 } })
    if (path === '/api/v1/me/movie-nights' || path === '/api/v1/me/movie-nights/invitations') {
      const inbox = path.endsWith('/invitations'), minimal = { id: 12, title: event().title, host, starts_at: starts, timezone: 'Asia/Beirut', status, my_rsvp: rsvp }
      const items = inbox ? owner === 9 && rsvp !== 'accepted' ? [{ id: 90, participant: guest, rsvp_status: rsvp, responded_at: null, movie_night: minimal }] : [] : member() ? [event()] : []
      const filtered = !inbox && url.searchParams.has('status') ? items.filter(item => item.status === url.searchParams.get('status')) : items
      const p = Number(url.searchParams.get('page') || 1), per = Number(url.searchParams.get('per_page') || 12)
      return reply({ data: filtered.slice((p - 1) * per, p * per), meta: { page: p, per_page: per, total_results: filtered.length, total_pages: Math.ceil(filtered.length / per) } })
    }
    if (path === '/api/v1/me/movie-nights/12') return member() ? reply({ data: { ...event(), location: 'PRIVATE_ROOM', meeting_url: 'https://example.test/private' } }) : reply({}, 404)
    if (path.endsWith('/12/invitations')) return owner === 7 ? reply({ data: [], meta: { page: 1, per_page: 12, total_pages: 0, total_results: 0 } }) : reply({}, 403)
    if (path.endsWith('/12/movies') && method === 'GET') return member() ? reply({ data: entries.map(item => ({ ...item, movie: metadata ? movie(item.tmdb_id) : null })), meta: { page: 1, per_page: 12, total_pages: 1, total_results: 3, metadata_unavailable: !metadata } }) : reply({}, 404)
    if (path.endsWith('/12/votes')) return !member() ? reply({}, 404) : failTotals ? failTotals === 'network' ? route.abort('failed') : reply({}, 503) : reply({ data: { total_votes: count, leaders, my_vote: 1000, voting_open: event().voting_open, totals: entries.map(item => ({ tmdb_id: item.tmdb_id, movie_night_movie_id: item.id, votes: leaders.includes(item.tmdb_id) ? 1 : 0 })) } })
    if (path.endsWith('/12/vote') && method === 'PUT') {
      const failed = failure
      if (hold) { const job = hold; job.started = true; await job.promise }
      if (failed) return reply({}, 503)
      return reply({ data: { movie_night_movie_id: body.movie_night_movie_id, updated_at: '2026-11-26T18:00:00Z' } })
    }
    if (path.endsWith('/12/finalize') && method === 'POST') {
      const failed = failure, result = { ...event(), status: 'finalized', finalized_tmdb_id: body.tmdb_id ?? leaders[0], finalized_at: '2026-11-26T18:00:00Z', voting_open: false, location: 'PRIVATE_ROOM', meeting_url: 'https://example.test/private' }
      if (hold) { const job = hold; job.started = true; await job.promise }
      if (failed === 'tie') { failTotals = reconciliationFailure; leaders = [550, 551]; return reply({ code: 'MOVIE_NIGHT_TIE', leaders }, 409) }
      if (failed === 'selection') { failTotals = reconciliationFailure; leaders = [551, 552]; return reply({ errors: { tmdb_id: ['Choose a highest-voted movie.'] } }, 422) }
      if (failed === 'cancel') { status = 'cancelled'; return reply({}, 409) }
      if (failed === 'final') { status = 'finalized'; winner = 551; return reply({}, 409) }
      if (failed === 'denied') { accessible = false; return reply({}, 404) }
      if (failed === 'network') return route.abort('failed')
      if (failed) return reply({}, 503)
      status = result.status; winner = result.finalized_tmdb_id
      return reply({ data: result })
    }
    unexpected.push(`${method} ${path}`); return reply({}, 404)
  })
  const refresh = () => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const action = () => page.getByRole('button', { name: 'Finalize Movie Night', exact: true })
  const confirm = () => page.getByRole('button', { name: 'Confirm finalization', exact: true })
  const dialog = () => page.getByRole('dialog')
  const writes = () => requests.filter(item => item.path.endsWith('/finalize') && item.method === 'POST')
  const idle = () => page.waitForTimeout(250)
  const reset = async (id = 7) => { owner = id; account = 'active'; status = 'scheduled'; rsvp = 'accepted'; starts = '2030-07-16T18:00:00Z'; accessible = true; leaders = [550]; count = 2; winner = null; failure = null; metadata = true; failMetadata = false; failTotals = false; reconciliationFailure = null; await page.goto(`${base}/movie-nights/12`); await page.getByRole('list', { name: 'Shared movie shortlist' }).waitFor(); await idle() }
  const layout = async (state, modal = false) => {
    for (const width of [390, 768, 1024, 1440]) {
      if (!modal) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
      const box = await page.evaluate(modal => { const root = document.querySelector(modal ? 'dialog' : '.movie-nights-page'), r = root.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth || root.scrollWidth > root.clientWidth, left: r.left, right: r.right, top: r.top, header: document.querySelector('.app-header').getBoundingClientRect().bottom, scroll: [root.scrollWidth, root.clientWidth, document.documentElement.scrollWidth, innerWidth], wide: [...document.querySelectorAll('body *')].filter(el => { const b = el.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1) }).map(el => [el.tagName, el.className, el.getBoundingClientRect().width]).slice(0,10), posters: [...root.querySelectorAll('.movie-poster')].map(el => el.getBoundingClientRect().width / el.getBoundingClientRect().height) } }, modal)
      assert(!box.overflow && box.left >= 0 && box.right <= width + 1 && box.posters.every(ratio => Math.abs(ratio - 2/3) < .02), `${state}/${width} geometry ${JSON.stringify(box)}`)
      if (!modal) assert(box.top >= box.header - 1, `${state}/${width} header overlap`)
      geometry.push({ state, width, overflow: box.overflow })
      if (screenshots) await page.screenshot({ path: `${screenshots}/${state}-${width}.png`, fullPage: !modal })
    }
  }
  await reset(); await action().click(); await dialog().waitFor(); await idle()
  assert(await dialog().getByText('Leading movie:', { exact: false }).count() === 1, 'Missing sole leader')
  assert(await dialog().getByText('Finalization is irreversible.', { exact: false }).count() === 1, 'Missing irreversible copy')
  assert(await page.getByRole('button', { name: 'Keep voting results' }).evaluate(el => el === document.activeElement), 'Unsafe default focus')
  await layout('sole-confirmation', true); await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'detached' }); assert(writes().length === 0, 'Escape submitted')
  await action().click(); await confirm().click(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor()
  assert(JSON.stringify(writes().at(-1).body) === '{}', 'Sole winner client-selected')
  assert(!await action().count() && !await page.getByRole('button', { name: 'Edit movie night' }).count() && !await page.getByRole('button', { name: 'Nominate a movie', exact: true }).count(), 'Terminal mutation controls')
  await layout('finalized-host'); checks.push('Sole winner, irreversible safe-focus confirmation, Escape cancellation, empty payload, immediate terminal controls and stored winner')
  await reset(); leaders = [550, 551]; await refresh(); await idle(); await action().click(); await dialog().waitFor(); assert(await confirm().isDisabled(), 'Tie preselected')
  assert(await dialog().getByRole('radio').count() === 2, 'Off-leader choices')
  await layout('tie-confirmation', true); await dialog().getByRole('radio').nth(1).check(); await confirm().click(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor()
  assert(writes().at(-1).body.tmdb_id === 551 && winner === 551, 'Candidate ID used for tie')
  assert(await page.getByText('Tied leaders:', { exact: false }).count() === 1 && await page.getByRole('list', { name: 'Finalized winning movie' }).getByText('Authoritative film 551', { exact: true }).count() === 1, 'Winner inferred from tied leaders')
  checks.push('Explicit tied TMDB selection only; finalized winner remains stored selection with tied frozen totals')
  owner = 9; await page.reload(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor(); assert(!await page.getByRole('list', { name: 'Invited participants' }).count() && await page.getByText('The guest list is managed by the host.', { exact: true }).count() === 1 && !await action().count(), 'Guest management leaked'); await layout('finalized-guest'); checks.push('Accepted guest finalized read-only view with no host controls')
  for (const conflict of ['tie', 'selection']) {
    await reset(); if (conflict === 'selection') { leaders = [550, 551]; await refresh(); await idle() }
    failure = conflict; await action().click(); if (conflict === 'selection') await dialog().getByRole('radio').first().check()
    const before = writes().length; await confirm().click(); await dialog().waitFor({ state: 'detached' }); await idle(); assert(status === 'scheduled' && writes().length === before + 1, 'Conflict optimistic/retried')
    await page.getByText('The result needs a fresh review.', { exact: false }).waitFor(); failure = null; await action().click(); assert(await confirm().isDisabled(), 'Stale confirmation reused'); assert(await dialog().getByRole('radio').count() === 2, 'Fresh tie absent'); await page.keyboard.press('Escape')
  }
  checks.push('Sole-to-tie and invalid-selection conflicts refresh authoritative results, retire dialog/selection and require fresh confirmation without retry')
  for (const conflict of ['cancel', 'final']) {
    await reset(); failure = conflict; await action().click(); await confirm().click(); await dialog().waitFor({ state: 'detached' }); await idle(); assert(!await action().count(), 'Concurrent lifecycle left finalize action')
    if (conflict === 'final') await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor()
  }
  checks.push('Concurrent cancellation/finalization refreshes authoritative lifecycle without replacement write')
  for (const change of ['same-votes', 'new-leaders', 'permission', 'session', 'close']) {
    await reset(); leaders = [550, 551]; await refresh(); await idle(); await action().click(); await dialog().getByRole('radio').first().check()
    await confirm().evaluate(el => { const key = Object.keys(el).find(key => key.startsWith('__reactProps$')); window.__retiredNightConfirm = el[key].onClick })
    const before = writes().length
    if (change === 'close') await page.keyboard.press('Escape')
    else if (change === 'permission') {
      account = 'restricted'; await refresh(); await dialog().waitFor({ state: 'detached' }); account = 'active'; await refresh()
    } else if (change === 'session') {
      await page.waitForTimeout(5100); owner = 11; await refresh(); await page.getByText('Movie night unavailable.', { exact: true }).waitFor()
      await page.waitForTimeout(5100); owner = 7; await refresh()
    } else { if (change === 'new-leaders') leaders = [551, 552]; await refresh() }
    await dialog().waitFor({ state: 'detached' }); await action().waitFor(); await idle(); assert(await action().isEnabled(), `${change}: fresh data not ready`)
    await page.evaluate(() => window.__retiredNightConfirm()); await idle()
    assert(writes().length === before && !await dialog().count(), `${change}: old callback submitted after successful refresh/restoration`)
    await action().click(); assert(await confirm().isDisabled(), `${change}: restored selection`)
    await page.evaluate(() => { window.__retiredNightConfirm(); delete window.__retiredNightConfirm }); await idle()
    assert(writes().length === before && await confirm().isDisabled(), `${change}: old callback authorized the new dialog`)
    await dialog().getByRole('radio').last().check(); await confirm().click(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor()
    assert(writes().length === before + 1 && writes().at(-1).body.tmdb_id === leaders.at(-1), `${change}: only a new explicit confirmation may submit`)
  }
  checks.push('Retired selected callbacks remain denied after unchanged/changed successful voting reads, permission restoration, same-owner session replacement and explicit close; only a newly opened and explicitly selected confirmation submits')

  for (const conflict of ['tie', 'selection']) for (const failedRead of [503, 'network']) {
    await reset(); if (conflict === 'selection') { leaders = [550, 551]; await refresh(); await idle() }
    failure = conflict; reconciliationFailure = failedRead
    await action().click(); if (conflict === 'selection') await dialog().getByRole('radio').first().check()
    // Retain the mounted confirmation callback to exercise admission through a genuinely stale closure.
    await confirm().evaluate(el => { const key = Object.keys(el).find(key => key.startsWith('__reactProps$')); window.__staleNightConfirm = el[key].onClick })
    const before = writes().length; await confirm().click(); await dialog().waitFor({ state: 'detached' })
    await page.getByText('Voting results unavailable.', { exact: true }).waitFor(); await idle()
    assert(await action().isDisabled() && writes().length === before + 1, `${conflict}/${failedRead}: stale totals enabled confirmation or automatic retry`)
    await page.evaluate(() => { window.__staleNightConfirm() }); await idle()
    assert(!await dialog().count() && writes().length === before + 1, 'Retired callback submitted with cached totals')
    if (failedRead === 503) {
      account = 'restricted'; await refresh(); await action().waitFor({ state: 'detached' }); account = 'active'; await refresh(); await action().waitFor(); await idle()
    } else {
      await page.waitForTimeout(5100); owner = 11; await refresh(); await page.getByText('Movie night unavailable.', { exact: true }).waitFor()
      await page.waitForTimeout(5100); owner = 7; await refresh(); await page.getByText('Voting results unavailable.', { exact: true }).waitFor()
    }
    assert(await action().isDisabled() && !await dialog().count(), 'Permission/session restoration revived stale confirmation')
    failTotals = false; failure = null; reconciliationFailure = null
    await page.locator('.night-voting').getByRole('button', { name: 'Try again', exact: false }).click(); await idle()
    assert(await action().isEnabled() && !await dialog().count(), 'Fresh read did not recover explicitly')
    await page.evaluate(() => window.__staleNightConfirm()); await idle()
    assert(writes().length === before + 1 && !await dialog().count(), 'Retired confirmation submitted after successful reconciliation')
    await action().click(); assert(await confirm().isDisabled(), 'Recovered tie selection was retained')
    await page.evaluate(() => { window.__staleNightConfirm(); delete window.__staleNightConfirm }); await idle()
    assert(writes().length === before + 1 && await confirm().isDisabled(), 'Old callback bypassed the newly opened explicit confirmation')
    const values = await dialog().getByRole('radio').evaluateAll(inputs => inputs.map(input => Number(input.value)))
    assert(JSON.stringify(values) === JSON.stringify(leaders), 'Recovery used old leader choices')
    await dialog().getByRole('radio').last().check(); await confirm().click(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor()
    assert(writes().length === before + 2 && writes().at(-1).body.tmdb_id === leaders.at(-1), 'Recovery did not require new current-leader confirmation')
  }
  checks.push('Four tie/invalid-selection × 503/network reconciliation failures block stale callback/confirmation, survive restriction/session changes and recover only after fresh voting reads and explicit new selection')

  for (const failed of [503, 'network']) {
    await reset(); failure = failed; await action().click(); const before = writes().length; await confirm().click(); await page.getByRole('alert').waitFor(); assert(status === 'scheduled' && writes().length === before + 1, 'Failure changed lifecycle or retried'); await page.keyboard.press('Escape')
  }
  checks.push('Server/network failures preserve scheduled state and require explicit retry')
  await reset(); count = 0; leaders = []; await refresh(); await idle(); assert(await action().isDisabled(), 'Zero-vote finalization enabled'); failTotals = true; await refresh(); await page.getByText('Voting results unavailable.', { exact: true }).waitFor(); assert(await action().isDisabled(), 'Unavailable totals enabled'); checks.push('Zero votes and unavailable totals prevent confirmation')
  await reset(); starts = '2020-01-01T00:00:00Z'; await refresh(); await idle(); assert(await action().isEnabled(), 'Start deadline blocked finalization'); checks.push('Finalization remains eligible after start while voting is closed')
  await reset(); starts = new Date(Date.now() + 1800).toISOString(); await refresh(); await idle(); await action().click(); await page.waitForTimeout(2000); assert(await confirm().isEnabled(), 'Deadline retired finalization'); await confirm().click(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor(); checks.push('An open finalization confirmation survives the local voting deadline and can finalize afterwards')
  for (const reason of ['restriction', 'lifecycle', 'votes', 'access']) {
    await reset(); await action().click(); await dialog().waitFor()
    if (reason === 'restriction') account = 'restricted'; if (reason === 'lifecycle') status = 'cancelled'; if (reason === 'votes') leaders = [551, 552]; if (reason === 'access') accessible = false
    await refresh(); await dialog().waitFor({ state: 'detached' }); account = 'active'; status = 'scheduled'; accessible = true
    if (reason === 'access') await page.reload(); else await refresh()
    await action().waitFor(); await idle(); assert(!await dialog().count(), `Restored ${reason} reopened`); await action().click(); await dialog().waitFor(); await page.keyboard.press('Escape')
  }
  checks.push('Mounted restriction/lifecycle/tally/access changes clear confirmations; restoration requires explicit reopen')
  const beginHold = () => { let release; hold = { started: false, promise: new Promise(done => { release = done }), release: () => release() }; return hold }
  for (const direction of ['finalize-first', 'vote-first']) {
    await reset(); failure = 503; const job = beginHold(); await action().click(); await dialog().waitFor()
    const before = requests.filter(item => item.path.endsWith('/finalize') || item.path.endsWith('/vote')).length
    // Invoke both actual mounted React handlers in one JS turn, retaining their pre-render closures.
    // The normal native modal also makes background controls inert; this deliberately exercises below that UI guard.
    await page.evaluate(direction => {
      const props = el => el[Object.keys(el).find(key => key.startsWith('__reactProps$'))]
      const finalize = props([...document.querySelectorAll('dialog button')].find(el => el.textContent === 'Confirm finalization')).onClick
      const vote = props(document.querySelector('.night-candidate[data-candidate-id="1001"] button[aria-pressed]')).onClick
      if (direction === 'finalize-first') { finalize(); vote() } else { vote(); finalize() }
    }, direction)
    await idle(); assert(job.started, 'Leading command did not reach held fixture')
    const commands = requests.filter(item => item.path.endsWith('/finalize') || item.path.endsWith('/vote')).slice(before)
    assert(commands.length === 1 && commands[0].path.endsWith(direction === 'finalize-first' ? '/finalize' : '/vote'), `${direction}: both consumers admitted synchronous commands`)
    account = 'restricted'; await refresh(); await dialog().waitFor({ state: 'detached' }); account = 'active'; await refresh(); await action().waitFor(); await idle()
    assert(await action().isDisabled(), 'Restoration released shared unresolved command')
    job.release(); hold = null; await idle(); assert(await action().isEnabled() && !await dialog().count(), 'Settled shared lock did not release cleanly')
    assert(requests.filter(item => item.path.endsWith('/finalize') || item.path.endsWith('/vote')).length === before + 1, 'Rejected overlap was queued or retried')
  }
  checks.push('Mounted finalization-first and vote-first handlers invoked synchronously share exclusion before rerender, retain held locks through permission restoration and never queue the rejected command')
  for (const failed of [503, null]) {
    await reset(); failure = failed; const job = beginHold(); await action().click(); const before = writes().length; await confirm().evaluate(el => { el.click(); el.click() }); await page.waitForFunction(() => document.querySelector('dialog')?.getAttribute('aria-busy') === 'true')
    account = 'restricted'; await refresh(); await dialog().waitFor({ state: 'detached' }); account = 'active'; await refresh(); await idle(); assert(await action().isDisabled() && writes().length === before + 1, 'Request lock released on restoration')
    job.release(); hold = null; await idle(); assert(!await page.getByRole('alert').count() && !await dialog().count(), 'Retired completion restored error/dialog')
    if (!failed) await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor(); else assert(await action().isEnabled(), 'Lock did not release')
  }
  checks.push('Held success/failure through permission loss retains unresolved lock, reconciles confirmed write and suppresses stale completion presentation')
  for (const change of ['switch', 'logout', 'revoke', 'leave']) {
    await reset(); const job = beginHold(); await action().click(); await confirm().click(); await idle()
    if (change === 'switch') { await page.waitForTimeout(5100); owner = 11; await refresh(); await page.getByText('Movie night unavailable.', { exact: true }).waitFor() }
    if (change === 'logout') { await page.waitForTimeout(5100); owner = 0; await refresh(); await page.waitForURL('**/login*') }
    if (change === 'revoke') { accessible = false; await refresh(); await page.getByText('Movie night unavailable.', { exact: true }).waitFor() }
    if (change === 'leave') await page.goto(`${base}/movie-nights?status=scheduled`)
    const url = page.url(); job.release(); hold = null; await idle(); assert(page.url() === url && !await dialog().count() && !await page.getByRole('heading', { name: 'Your finalized movie' }).count(), `Late ${change} private presentation`)
  }
  checks.push('Held finalization after switch/logout/access revocation/navigation cannot restore private UI or navigate')
  await reset(); metadata = false; status = 'finalized'; winner = 999; await page.reload(); await page.getByRole('list', { name: 'Finalized winning movie' }).getByText('Authoritative film 999', { exact: true }).waitFor(); assert(requests.some(item => item.path === '/api/v1/movies/999'), 'Off-page winner lookup absent'); checks.push('Off-page winner uses one public Core movie detail query')
  failMetadata = true; winner = 998; await page.reload(); await page.getByText('Metadata unavailable · TMDB #998', { exact: true }).waitFor(); await layout('winner-fallback'); checks.push('Provider failure preserves finalized winner with stable TMDB-ID and poster fallback')
  for (const response of ['pending', 'declined']) {
    owner = 9; rsvp = response; await page.goto(`${base}/movie-nights/12`); await page.getByText('Movie night unavailable.', { exact: true }).waitFor(); assert(!await page.getByRole('list', { name: 'Finalized winning movie' }).count(), 'Private winner leaked')
    await page.goto(`${base}/movie-nights?view=invitations`); await page.getByText('This invitation is closed. Private details are unavailable.', { exact: true }).waitFor(); assert(!await page.getByText('PRIVATE_ROOM', { exact: true }).count(), 'Private invitation fields')
  }
  checks.push('Pending/declined finalized events remain minimal closed invitations without private winner access')
  rsvp = 'accepted'; await page.goto(`${base}/movie-nights?status=finalized`); await page.getByRole('link', { name: 'View The final shared screening' }).click(); await page.getByRole('heading', { name: 'Your finalized movie' }).waitFor(); await page.goBack(); assert(new URL(page.url()).searchParams.get('status') === 'finalized', 'Finalized filter URL lost'); checks.push('Finalized My Movie Nights filter/detail/back preserves partition and URL state')
  await reset(); await page.emulateMedia({ reducedMotion: 'reduce' }); await action().focus(); await page.keyboard.press('Enter'); await dialog().waitFor(); await idle(); await page.getByRole('button', { name: 'Keep voting results' }).focus(); await page.keyboard.press('Tab'); assert(await confirm().evaluate(el => el === document.activeElement), 'Keyboard order'); await page.keyboard.press('Tab'); assert(await dialog().getByRole('button', { name: 'Close dialog' }).evaluate(el => el === document.activeElement), 'Focus trap'); await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'detached' }); assert(await action().evaluate(el => el === document.activeElement), 'Focus restoration'); checks.push('Keyboard open/tab trap/Escape/focus restoration with reduced motion')
  assert(errors.length === 0 && unexpected.length === 0, `Unexpected errors/requests: ${JSON.stringify({ errors, unexpected })}`)
  return { checks, geometry, requests: requests.length, finalizationWrites: writes(), pageErrors: errors, unexpectedRequests: unexpected }
}
