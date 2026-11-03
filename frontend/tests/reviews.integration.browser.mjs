// Actual Core/Catalog HTTP and disposable MySQL databases, with explicitly seeded provider fixtures.
export async function runReviewsIntegration(page, { base, core, email, otherEmail, password, screenshots }) {
  const errors = [], responses = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { const path = new URL(r.url()).pathname; if (path.startsWith('/api/v1/') && path.includes('/reviews')) responses.push({ path, method: r.request().method(), status: r.status() }) })
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const section = page.locator('.community-reviews')
  const editor = () => section.getByRole('textbox', { name: 'Your review', exact: true })
  const login = async address => {
    await page.goto(`${base}/login`); await page.getByLabel('Email address', { exact: true }).fill(address); await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(`${base}/`)
  }
  const logout = async () => { const response = page.waitForResponse(r => r.url().endsWith('/auth/logout') && r.status() === 204); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await response; await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor() }
  await login(email)
  await page.getByRole('link', { name: 'Discover', exact: true }).click(); await page.getByRole('searchbox').fill('integration')
  await page.getByRole('link', { name: 'View M2.4 integration fixture', exact: true }).click()
  await section.getByText('No reviews yet. Be the first to share your thoughts.', { exact: true }).waitFor()
  await page.locator('.community-ratings').getByRole('radio', { name: '5 stars', exact: true }).locator('..').click()
  await page.getByText('Your 5-star rating is saved.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add to Watchlist', exact: true }).click(); await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click(); await page.getByRole('button', { name: 'Remove from Watched', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click(); await page.getByRole('button', { name: 'Create new collection', exact: false }).click(); await page.getByLabel('Collection name', { exact: true }).fill('Reviews stay independent')
  await page.getByRole('button', { name: 'Create & save movie', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Collection created and movie saved.' }).waitFor(); await page.keyboard.press('Escape')
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); await editor().fill('The final scene changes everything.\nA real-service spoiler fixture.'); await section.getByRole('switch').check()
  const createdResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/550/reviews') && r.request().method() === 'POST' && r.status() === 201)
  await section.getByRole('button', { name: 'Publish review', exact: true }).click(); const created = (await (await createdResponse).json()).data
  await section.getByText('Your review is published.', { exact: true }).waitFor()
  const cardA = section.getByRole('article', { name: 'Review by m24_fan', exact: true })
  assert(!await cardA.getByText(created.body, { exact: true }).count(), 'Real created spoiler exposed text')
  await page.reload(); await cardA.waitFor(); assert(!await cardA.getByText(created.body, { exact: true }).count(), 'Refresh revealed spoiler')
  await cardA.getByRole('button', { name: 'Reveal review', exact: true }).focus(); await page.keyboard.press('Enter'); await cardA.getByText(created.body, { exact: true }).waitFor()
  await cardA.getByRole('button', { name: 'Hide spoiler', exact: true }).click(); assert(!(await cardA.ariaSnapshot()).includes(created.body), 'Hidden actual spoiler remained accessible')
  await section.getByRole('button', { name: 'Edit your review', exact: true }).click()
  assert(await editor().inputValue() === created.body && await section.getByRole('switch').isChecked(), 'Actual edit not prepopulated')
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); if (screenshots) await section.locator('.review-editor').screenshot({ path: `${screenshots}/integration-editor-${width}.png`, style: '.app-header { visibility: hidden !important }' }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Actual editor overflow ${width}`) }
  const text = 'An updated perspective.\n<img src=x onerror="window.__reviewXss=1">'
  await editor().fill(text); await section.getByRole('switch').uncheck()
  const patchedResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(`/550/reviews/${created.id}`) && r.request().method() === 'PATCH' && r.status() === 200)
  await section.getByRole('button', { name: 'Save changes', exact: true }).click(); const patched = (await (await patchedResponse).json()).data
  await section.getByText('Your review was updated.', { exact: true }).waitFor(); assert(patched.id === created.id && patched.created_at === created.created_at && patched.contains_spoilers === false, 'Real edit changed identity or missed flag')
  await page.reload(); await cardA.getByText(text, { exact: true }).waitFor(); assert(await cardA.locator('img').count() === 0 && await page.evaluate(() => window.__reviewXss) === undefined, 'Actual review body executed markup')
  for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); if (screenshots) await section.screenshot({ path: `${screenshots}/integration-reviews-${width}.png`, style: '.app-header { visibility: hidden !important }' }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Actual reviews overflow ${width}`) }
  await section.getByRole('button', { name: 'Delete your review', exact: true }).click()
  if (screenshots) await page.getByRole('dialog').screenshot({ path: `${screenshots}/integration-delete.png` })
  await page.keyboard.press('Escape'); await section.getByRole('button', { name: 'Delete your review', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click()
  await section.getByText('Your review was deleted.', { exact: true }).waitFor()
  assert(await page.locator('.community-ratings').getByRole('radio', { name: '5 stars', exact: true }).isChecked(), 'Actual review delete changed rating')
  assert(await page.getByRole('button', { name: 'Remove from Watchlist', exact: true }).count() === 1 && await page.getByRole('button', { name: 'Remove from Watched', exact: true }).count() === 1, 'Actual review delete changed library')
  await page.getByRole('button', { name: 'Save to collection', exact: false }).click(); assert(await page.getByRole('checkbox').isChecked(), 'Actual review delete changed collection'); await page.keyboard.press('Escape')
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); await editor().fill('User A final spoiler review.'); await section.getByRole('switch').check()
  const secondResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/550/reviews') && r.request().method() === 'POST' && r.status() === 201)
  await section.getByRole('button', { name: 'Publish review', exact: true }).click(); const second = (await (await secondResponse).json()).data; await section.getByText('Your review is published.', { exact: true }).waitFor(); assert(second.id !== created.id, 'Recreation reused deleted review')
  await logout(); await page.goto(`${base}/movies/550`); await cardA.waitFor()
  assert(!await cardA.getByRole('button', { name: /Edit|Delete/ }).count(), 'Guest saw ownership actions')
  await cardA.getByRole('button', { name: 'Reveal review', exact: true }).click(); await cardA.getByText(second.body, { exact: true }).waitFor()
  await login(otherEmail); await page.goto(`${base}/movies/550`); await section.getByRole('button', { name: 'Write a review', exact: true }).waitFor()
  assert(!await cardA.getByRole('button', { name: /Edit|Delete/ }).count(), 'Non-owner saw ownership actions')
  const forbidden = await page.evaluate(async ({ core, id }) => {
    await fetch(`${core}/sanctum/csrf-cookie`, { credentials: 'include', headers: { Accept: 'application/json' } })
    const token = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)[1])
    const response = await fetch(`${core}/api/v1/movies/550/reviews/${id}`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ body: 'Not owned' }) })
    return { status: response.status, body: await response.json() }
  }, { core, id: second.id })
  assert(forbidden.status === 404 && forbidden.body.message === 'Not found.', 'Real non-owner modification not safely denied')
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); assert(await editor().inputValue() === '', 'Other account inherited draft')
  await editor().fill('User B review without a rating.'); await section.getByRole('switch').check(); await section.getByRole('button', { name: 'Publish review', exact: true }).click(); await section.getByText('Your review is published.', { exact: true }).waitFor()
  assert(await section.getByRole('article').count() === 2, 'Real two-user review list missing entry')
  assert(!await page.locator('.community-ratings input:checked').count(), 'Review creation added a personal rating')
  checks.push('Actual login/discovery and ratings/library/collections; spoiler publish/reload/reveal/hide; edit/clear flag/plain-text persistence; delete/recreate; unchanged memberships; guest reading; second-user isolation/independent review; forged PATCH returns safe 404; responsive layouts')
  assert(errors.length === 0, errors.join('\n'))
  return { checks, responses, errors }
}

export async function runReviewsOutage(page, { core, screenshots }) {
  const section = page.locator('.community-reviews')
  const conflict = await page.evaluate(async core => {
    await fetch(`${core}/sanctum/csrf-cookie`, { credentials: 'include', headers: { Accept: 'application/json' } })
    const token = decodeURIComponent(document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)[1])
    const response = await fetch(`${core}/api/v1/movies/550/reviews`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ body: 'Duplicate during outage' }) })
    return { status: response.status, body: await response.json() }
  }, core)
  if (conflict.status !== 409 || conflict.body.code !== 'REVIEW_EXISTS') throw new Error('Duplicate during actual outage did not return conflict')
  await section.getByRole('button', { name: 'Edit your review', exact: true }).click(); await section.getByRole('textbox', { name: 'Your review', exact: true }).fill('Existing review updated with Catalog stopped.'); await section.getByRole('switch').uncheck()
  await section.getByRole('button', { name: 'Save changes', exact: true }).click(); await section.getByText('Your review was updated.', { exact: true }).waitFor()
  await section.getByRole('button', { name: 'Delete your review', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click(); await section.getByText('Your review was deleted.', { exact: true }).waitFor()
  await section.getByRole('button', { name: 'Write a review', exact: true }).click(); await section.getByRole('textbox', { name: 'Your review', exact: true }).fill('New review cannot be confirmed during outage.')
  await section.getByRole('button', { name: 'Publish review', exact: true }).click(); await section.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor()
  if (await section.getByRole('textbox', { name: 'Your review', exact: true }).inputValue() !== 'New review cannot be confirmed during outage.') throw new Error('Outage lost actual draft')
  if (screenshots) { await page.setViewportSize({ width: 375, height: 1000 }); await section.screenshot({ path: `${screenshots}/integration-outage.png`, style: '.app-header { visibility: hidden !important }' }) }
  const browser = page.context().browser(), guest = await browser.newContext()
  const response = await guest.request.get(`${core}/api/v1/movies/550/reviews`), data = await response.json()
  if (response.status() !== 200 || data.data.length !== 1 || Object.keys(data.data[0].author).sort().join() !== 'avatar_url,id,username') throw new Error('Actual guest listing/outage author projection failed')
  await guest.close()
  return 'Stopped Catalog: duplicate 409, public/own reads, edit/delete and anonymous list work; new creation fails safely while preserving draft'
}
