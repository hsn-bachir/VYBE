// Run with the existing Playwright browser harness against a local Vite server.
export async function runForYouChecks(page) {
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' })
  const p = await context.newPage()
  const excluded = new Set()
  let mode = 'personalized'
  const user = { id: 9001, username: 'fixture', email: 'fixture@example.test', email_verified_at: '2026-01-01', avatar_url: null }
  await p.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }))
  await p.route('**/api/v1/**', async route => {
    const url = route.request().url()
    let data
    if (url.includes('/auth/me')) data = { data: mode === 'guest' ? null : user }
    else if (url.includes('/me/access')) data = { data: { role: 'user', account_status: 'active' } }
    else if (url.includes('/me/recommendations')) {
      if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
      const movies = Array.from({ length: 18 }, (_, i) => ({ tmdb_id: i + 1, title: `Acceptance film ${i + 1}`, overview: null, poster_path: null, backdrop_path: null, release_date: '2020-01-01', tmdb_rating: 8, tmdb_vote_count: 500 })).filter(movie => !excluded.has(movie.tmdb_id))
      data = { data: { sections: mode === 'empty' ? [] : [{ id: 'top', title: mode === 'cold' ? 'Worth discovering' : 'Top Picks for You', explanation: 'Test fixture recommendations.', movies }] }, meta: { personalized: mode !== 'cold', partial: false } }
    } else if (url.includes('/me/watchlist') && route.request().method() === 'POST') {
      const id = route.request().postDataJSON().tmdb_id
      excluded.add(id)
      data = { data: { tmdb_id: id } }
    } else data = { data: [] }
    return route.fulfill({ json: data })
  })
  const results = []
  try {
    for (const width of [1440, 1024, 768, 390]) {
      await p.setViewportSize({ width, height: 1000 })
      await p.goto('http://127.0.0.1:5173/for-you')
      await p.getByRole('heading', { name: 'Top Picks for You.' }).waitFor()
      if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Overflow at ${width}`)
      await p.screenshot({ path: `.playwright-mcp/for-you-${width}.png`, fullPage: true })
      results.push(`Responsive ${width}px passed`)
    }
    await p.getByRole('button', { name: 'Watchlist Acceptance film 1', exact: true }).click()
    await p.getByRole('link', { name: 'View Acceptance film 1', exact: true }).waitFor({ state: 'detached' })
    await p.reload()
    await p.getByRole('heading', { name: 'Top Picks for You.' }).waitFor()
    if (await p.getByRole('link', { name: 'View Acceptance film 1', exact: true }).count()) throw Error('Excluded film reappeared')
    results.push('Immediate save removal and reload passed')
    mode = 'error'
    await p.reload()
    await p.getByRole('button', { name: 'Try again' }).waitFor()
    mode = 'personalized'
    await p.getByRole('button', { name: 'Try again' }).click()
    await p.getByRole('heading', { name: 'Top Picks for You.' }).waitFor()
    results.push('Error/retry passed')
    mode = 'cold'
    await p.reload()
    await p.getByRole('heading', { name: 'Worth discovering.' }).waitFor()
    mode = 'empty'
    await p.reload()
    await p.getByText('No eligible films are available right now.', { exact: false }).waitFor()
    mode = 'guest'
    await p.reload()
    await p.waitForURL('**/login')
    results.push('Cold start, empty state, guest guard passed')
    return results
  } finally { await context.close() }
}
