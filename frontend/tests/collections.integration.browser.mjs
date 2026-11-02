// Requires actual Core/Catalog and disposable, explicitly seeded accounts/movie data.
export async function runCollectionsIntegration(page, { base, email, password, otherEmail, screenshots }) {
  const errors = [], responses = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { if (r.url().includes('/api/v1/me/')) responses.push({ path: new URL(r.url()).pathname, status: r.status() }) })
  const assert = (v, message) => { if (!v) throw new Error(message) }
  const login = async address => {
    await page.goto(`${base}/login`); await page.getByLabel('Email address', { exact: true }).fill(address); await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(`${base}/`)
  }
  await login(email)
  await page.getByRole('link', { name: 'Discover', exact: true }).click()
  await page.getByRole('searchbox').fill('integration')
  await page.getByRole('link', { name: 'View M2.2 integration fixture', exact: true }).click()
  await page.locator('.library-actions .membership-button').first().waitFor()
  const watch = page.getByRole('button', { name: 'Add to Watchlist', exact: true })
  if (await watch.count()) await watch.click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  const watched = page.getByRole('button', { name: 'Mark as Watched', exact: true })
  if (await watched.count()) await watched.click()
  await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click()
  const ids = []
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Create new collection', exact: false }).click()
    await page.getByLabel('Collection name', { exact: true }).fill('Favorites')
    await page.getByLabel('Description', { exact: false }).fill('A disposable collection integration fixture.')
    const created = page.waitForResponse(r => r.url().endsWith('/me/collections') && r.request().method() === 'POST' && r.status() === 201)
    await page.getByRole('button', { name: 'Create & save movie', exact: true }).click()
    const id = (await (await created).json()).data.id
    ids.push(id)
    await page.waitForFunction(id => { const e = document.querySelector(`input[aria-label="Favorites, collection ${id}"]`); return e?.checked && !e.disabled }, id)
  }
  await page.keyboard.press('Escape')
  await page.reload(); await page.getByRole('button', { name: 'Save to collection', exact: false }).click()
  for (const id of ids) { await page.getByRole('checkbox', { name: `Favorites, collection ${id}`, exact: true }).waitFor(); assert(await page.getByRole('checkbox', { name: `Favorites, collection ${id}`, exact: true }).isChecked(), 'Membership lost after reload') }
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    if (screenshots) await page.screenshot({ path: `${screenshots}/integration-save-${width}.png`, fullPage: true })
    assert(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth), `Save overflow ${width}`)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page.getByRole('link', { name: `Open Favorites, collection ${ids[0]}`, exact: true }).waitFor()
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); if (screenshots) await page.screenshot({ path: `${screenshots}/integration-collections-${width}.png`, fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overview overflow ${width}`) }
  await page.getByRole('link', { name: `Open Favorites, collection ${ids[0]}`, exact: true }).click()
  await page.getByRole('link', { name: 'View M2.2 integration fixture', exact: true }).waitFor()
  if (screenshots) await page.screenshot({ path: `${screenshots}/integration-detail.png`, fullPage: true })
  await page.getByRole('button', { name: 'Remove M2.2 integration fixture from collection', exact: true }).click()
  await page.getByRole('heading', { name: 'This collection is empty.', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click()
  await page.getByLabel('Collection name', { exact: true }).fill('Weekend films')
  await page.getByLabel('Description', { exact: false }).fill('')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByRole('heading', { name: 'Weekend films', exact: true }).waitFor()
  await page.reload(); await page.getByRole('heading', { name: 'Weekend films', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete collection', exact: true }).click()
  await page.waitForURL(`${base}/library/collections`)
  await page.getByRole('link', { name: `Open Favorites, collection ${ids[1]}`, exact: true }).click()
  await page.getByRole('link', { name: 'View M2.2 integration fixture', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor(); await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  checks.push('Real login/CSRF, Core→Catalog search/details, duplicate-name inline create, multi-save, refresh persistence, list/removal, edit/description clear, delete, other memberships intact')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor()
  await login(otherEmail)
  await page.goto(`${base}/library/collections`); await page.getByRole('button', { name: 'Create your first collection', exact: true }).waitFor()
  await page.goto(`${base}/library/collections/${ids[1]}`); await page.getByRole('heading', { name: 'Collection unavailable', exact: true }).waitFor()
  checks.push('Actual logout/login and second-owner 404 isolation')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor(); await login(email)
  await page.goto(`${base}/library/collections/${ids[1]}`); await page.getByRole('link', { name: 'View M2.2 integration fixture', exact: true }).waitFor()
  assert(errors.length === 0, errors.join('\n'))
  assert(!responses.some(r => r.status >= 400 && r.status !== 404), JSON.stringify(responses))
  return { ids, checks, responses, errors }
}
