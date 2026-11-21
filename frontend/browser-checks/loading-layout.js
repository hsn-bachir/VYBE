/* eslint-disable no-unused-expressions -- Evaluated by Playwright MCP browser_run_code_unsafe. */
async (page) => {
  await page.unrouteAll()
  const results = []
  for (const width of [360, 599, 768, 899, 1024, 1199, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/discover?query=batman']) {
      let requests = 0
      await page.route('**/api/v1/movies/**', async route => {
        const url = new URL(route.request().url())
        if (url.searchParams.get('page') === '2') { requests++; await new Promise(resolve => setTimeout(resolve, 1400)) }
        await route.continue()
      })
      await page.goto('http://localhost:5173' + path)
      await page.locator('.movie-card').nth(19).waitFor({ timeout: 20000 })
      await page.locator('.load-more-area').scrollIntoViewIfNeeded()
      await page.locator('.movie-skeleton').first().waitFor()
      const layout = await page.locator('.movie-grid').evaluate(grid => {
        const last = grid.children[19].getBoundingClientRect(), next = grid.children[20].getBoundingClientRect()
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length
        return { cols, sharesGrid: grid.querySelectorAll('.movie-card').length === 20 && grid.querySelectorAll('.movie-skeleton').length === 20, correctRow: 20 % cols ? Math.abs(last.y - next.y) < 1 : next.y > last.y }
      })
      if (!layout.sharesGrid || !layout.correctRow) throw new Error('Grid regression: ' + JSON.stringify({ width, path, layout }))
      await page.waitForFunction(() => document.querySelectorAll('.movie-card').length > 20)
      const unique = await page.locator('.movie-card').evaluateAll(nodes => new Set(nodes.map(node => node.getAttribute('href'))).size)
      if (unique !== 40 || requests !== 1) throw new Error('Duplicate page/cards')
      results.push({ width, path, ...layout, unique, requests })
      await page.unrouteAll()
    }
  }
  await page.route('**/api/v1/movies/popular*', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue() })
  await page.goto('http://localhost:5173/')
  await page.getByRole('status', { name: 'Loading Spotlight' }).waitFor()
  const pendingHeight = await page.locator('.spotlight-stage').evaluate(node => node.getBoundingClientRect().height)
  await page.locator('.spotlight-slide.is-active h3').waitFor()
  const loadedHeight = await page.locator('.spotlight-stage').evaluate(node => node.getBoundingClientRect().height)
  if (pendingHeight !== loadedHeight) throw new Error('Spotlight changed height')
  await page.unrouteAll()
  return { grids: results, spotlight: { pendingHeight, loadedHeight } }
}
