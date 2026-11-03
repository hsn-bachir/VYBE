// Actual Core/Catalog HTTP and separate disposable MySQL databases are required.
export async function runRatingsIntegration(page, { base, email, otherEmail, password, screenshots }) {
  const errors = [], responses = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { const path = new URL(r.url()).pathname; if (path.startsWith('/api/v1/') && /\/ratings(?:\/|$)/.test(path)) responses.push({ path, status: r.status() }) })
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const section = page.locator('.community-ratings')
  const choose = n => section.getByRole('radio', { name: `${n} ${n === 1 ? 'star' : 'stars'}`, exact: true }).locator('..').click()
  const checked = n => section.getByRole('radio', { name: `${n} ${n === 1 ? 'star' : 'stars'}`, exact: true }).isChecked()
  const saved = n => section.getByText(`Your ${n}-star rating is saved.`, { exact: true }).waitFor()
  const login = async address => {
    await page.goto(`${base}/login`); await page.getByLabel('Email address', { exact: true }).fill(address); await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(`${base}/`)
  }
  const logout = async () => { const response = page.waitForResponse(r => r.url().endsWith('/auth/logout') && r.status() === 204); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await response; await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor() }
  await login(email)
  await page.getByRole('link', { name: 'Discover', exact: true }).click()
  await page.getByRole('searchbox').fill('integration')
  await page.getByRole('link', { name: 'View M2.3 integration fixture', exact: true }).click()
  await section.getByText('No community ratings yet.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click()
  await page.getByRole('button', { name: 'Create new collection', exact: false }).click()
  await page.getByLabel('Collection name', { exact: true }).fill('Ratings stay independent')
  await page.getByRole('button', { name: 'Create & save movie', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Collection created and movie saved.' }).waitFor()
  await page.keyboard.press('Escape')
  await choose(5); await saved(5)
  await section.getByText('5.00', { exact: false }).waitFor()
  await page.reload(); await section.getByRole('radio', { name: '5 stars', exact: true }).waitFor(); assert(await checked(5), 'Real refresh did not preserve rating')
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await section.scrollIntoViewIfNeeded(); if (screenshots) await section.screenshot({ path: `${screenshots}/integration-ratings-${width}.png` }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Integration overflow ${width}`) }
  await logout(); await login(otherEmail); await page.goto(`${base}/movies/550`)
  await section.getByRole('radio', { name: '5 stars', exact: true }).waitFor(); assert(!await checked(5), 'Other user inherited personal rating')
  await choose(1); await saved(1); await section.getByText('3.00', { exact: false }).waitFor()
  await logout(); await login(email); await page.goto(`${base}/movies/550`)
  await section.getByRole('radio', { name: '5 stars', exact: true }).waitFor(); assert(await checked(5), 'User A lost own rating')
  await choose(3); await saved(3); await section.getByText('2.00', { exact: false }).waitFor()
  await section.getByRole('button', { name: 'Remove rating', exact: true }).click()
  await section.getByText('Your rating was removed.', { exact: true }).waitFor(); await section.getByText('1.00', { exact: false }).waitFor()
  assert(await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).count() === 1 && await page.getByRole('button', { name: 'Remove from Watched', exact: true }).count() === 1, 'Real rating operations changed library')
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click(); assert(await page.getByRole('checkbox').isChecked(), 'Real rating removal changed collection'); await page.keyboard.press('Escape')
  await logout(); await login(otherEmail); await page.goto(`${base}/movies/550`)
  await section.getByRole('radio', { name: '1 star', exact: true }).waitFor(); assert(await checked(1), 'User B own rating missing')
  checks.push('Actual login, discovery, library/collection creation; rating save and refresh; two-account average/distribution; update/delete and independent memberships; three responsive widths')
  assert(errors.length === 0, errors.join('\n'))
  return { checks, responses, errors }
}

export async function runRatingsOutage(page, screenshots) {
  const section = page.locator('.community-ratings')
  await section.getByRole('radio', { name: '2 stars', exact: true }).locator('..').click()
  await section.getByText('Your 2-star rating is saved.', { exact: true }).waitFor()
  await section.getByText('2.00', { exact: false }).waitFor()
  await section.getByRole('button', { name: 'Remove rating', exact: true }).click()
  await section.getByText('Your rating was removed.', { exact: true }).waitFor()
  await section.getByText('No community ratings yet.', { exact: true }).waitFor()
  await section.getByRole('radio', { name: '4 stars', exact: true }).locator('..').click()
  await section.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor()
  if (await section.getByRole('radio', { name: '4 stars', exact: true }).isChecked()) throw new Error('New rating showed confirmed during actual Catalog outage')
  if (screenshots) await section.screenshot({ path: `${screenshots}/integration-catalog-outage.png` })
  return 'Actual stopped Catalog: existing update/removal and public aggregates work; new rating safely fails with no success state'
}
