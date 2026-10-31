// Run only against independent disposable Core/Catalog databases with a seeded verified account/movie.
export async function runLibraryIntegration(page, { base, email, password, screenshots }) {
  const checks = [], responses = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().includes('/api/v1/me/')) responses.push({ path: new URL(response.url()).pathname, status: response.status() }) })
  await page.goto(`${base}/login`)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(`${base}/`)
  await page.getByRole('link', { name: 'Discover', exact: true }).click()
  await page.getByRole('searchbox').fill('integration')
  await page.getByRole('link', { name: 'View M2.1 integration fixture' }).click()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.getByRole('link', { name: 'View M2.1 integration fixture' }).waitFor()
  await page.reload()
  await page.getByRole('link', { name: 'View M2.1 integration fixture' }).click()
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.getByRole('link', { name: 'Watched', exact: true }).click()
  await page.locator('time').waitFor()
  await page.getByRole('link', { name: 'View M2.1 integration fixture' }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).waitFor()
  checks.push('Real login/session/CSRF, search via Core→Catalog, add, reload persistence, watched independence, DELETE CORS')
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  if (screenshots) {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(async () => { await Promise.all([...document.querySelectorAll('.cinematic-hero img')].map(img => img.decode().catch(() => {}))) })
      await page.screenshot({ path: `${screenshots}/integration-details-${width}.png`, fullPage: true })
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error(`Overflow at ${width}`)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  if (responses.some(r => r.status >= 400)) throw new Error(JSON.stringify(responses))
  return { checks, responses, errors }
}
