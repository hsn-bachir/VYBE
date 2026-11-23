// Isolated history fixture: no Core, Firebase, SMTP or Catalog mutations.
export async function runAdminSecurityChecks(page, base, screenshots) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const time = '2026-11-23T12:00:00Z'
  const actor = { id: 5, username: 'operator', email: 'operator@example.test', avatar_url: null, email_verified_at: time }
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' }
  const names = ['Movie metadata refreshed', 'Movie refresh failed', 'Movie refresh outcome unconfirmed', 'Movie refresh incomplete']
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/auth/me') ? { data: actor }
      : path.endsWith('/me/access') ? { data: { role: 'admin', account_status: 'active' } }
        : path.endsWith('/admin/actions') ? { data: [
          'movie.refreshed', 'movie.refresh_failed', 'movie.refresh_unconfirmed', 'movie.refresh_requested',
        ].map((action, index) => ({ id: index + 1, actor: { id: actor.id, username: actor.username }, action,
          target_type: 'movie', target_id: 550, reason: null, details: null, created_at: time })),
        meta: { page: 1, per_page: 20, total_pages: 1, total_results: 4 } } : { data: [] }
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
  })
  const results = []
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${base}/admin/actions`)
    for (const name of names) await page.getByText(name, { exact: true }).waitFor()
    await page.getByLabel('Target type').selectOption('movie')
    await page.waitForURL('**target_type=movie*')
    for (const name of names) await page.getByText(name, { exact: true }).waitFor()
    const menu = page.locator('.admin-mobile-menu summary')
    const menuVisible = await menu.isVisible()
    for (const expanded of menuVisible ? [false, true] : [false]) {
      if (expanded) await menu.click()
      const bounds = await page.evaluate(() => {
        const rect = selector => { const { x, y, width, height, bottom } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height, bottom } }
        return { viewport: innerWidth, document: document.documentElement.scrollWidth,
          heading: rect('.admin-heading'), filters: rect('.admin-filters'), table: rect('.admin-table-wrap'),
          actionCount: document.querySelectorAll('td[data-label="Action"]').length,
          clippedLabels: [...document.querySelectorAll('td[data-label="Action"]')].filter(cell => cell.scrollWidth > cell.clientWidth + 1).length }
      })
      assert(bounds.document <= bounds.viewport + 1, `Horizontal overflow at ${width}`)
      assert(bounds.heading.bottom <= bounds.filters.y + 1 && bounds.filters.bottom <= bounds.table.y + 1, `Overlapping content at ${width}`)
      assert(bounds.clippedLabels === 0, `Clipped action labels at ${width}`)
      assert(bounds.actionCount === 4, `Missing action history at ${width}`)
      await page.screenshot({ path: `${screenshots}/history-${width}-${expanded ? 'open' : 'closed'}.png`, fullPage: true })
      results.push({ width, expanded, ...bounds })
    }
  }
  assert(errors.length === 0, errors.join('\n'))
  return { results, errors, providers: 'fixtures only' }
}
