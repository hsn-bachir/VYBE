// Isolated motion acceptance. Synthetic metadata/images are confined to this browser test.
export async function runMotionDiscoveryChecks(page, base = 'http://localhost:5173') {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const checks = []
  const requests = []
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' }
  let releaseImage
  const imageGate = new Promise(resolve => { releaseImage = resolve })
  let delayed = false
  const movie = id => ({ tmdb_id: id, title: id === 2 ? 'The Extraordinary Journey Across the Quiet Side of the Universe' : `Motion test ${id}`,
    overview: 'A test-only premise with enough detail to verify comfortable line lengths, natural wrapping, and space between the movie metadata and its working details action.',
    poster_path: `/motion-poster-${id}.jpg`, backdrop_path: `/motion-backdrop-${id}.jpg`, release_date: '2025-01-02', tmdb_rating: 8, tmdb_vote_count: 40 })
  await page.unroute('**/api/v1/**')
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ status: 401, headers, json: { message: 'Unauthenticated.' } })
    requests.push(url.pathname)
    return route.fulfill({ headers, json: { data: Array.from({ length: 8 }, (_, i) => movie(i + 1)), meta: { page: Number(url.searchParams.get('page') || 1), total_pages: 3, total_results: 24 } } })
  })
  await page.route('**/image.tmdb.org/**', async route => {
    const url = route.request().url()
    if (url.includes('motion-backdrop-2')) { delayed = true; await imageGate }
    if (url.includes('motion-backdrop-3')) return route.abort()
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#302743"/></svg>' })
  })
  await page.clock.resume()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(base)
  await page.locator('.movie-card').first().waitFor()
  const framing = await page.evaluate(() => {
    const stage = document.querySelector('.spotlight-stage')
    const controls = stage?.querySelector('.spotlight-controls')
    const art = stage?.querySelector('.spotlight-slide.is-active .spotlight-art')
    const action = stage?.querySelector('.spotlight-slide.is-active .spotlight-copy a')
    const progress = stage?.querySelector('.spotlight-progress')
    if (!stage || !controls || !art || !action || !progress) return null
    const frame = stage.getBoundingClientRect()
    const buttons = controls.getBoundingClientRect()
    const image = art.getBoundingClientRect()
    return { imageBehindControls: image.top === frame.top && image.bottom === frame.bottom && buttons.top < image.bottom,
      controlsTransparent: getComputedStyle(controls).backgroundColor === 'rgba(0, 0, 0, 0)',
      actionClear: action.getBoundingClientRect().bottom < buttons.top,
      progressAtEdge: Math.abs(progress.getBoundingClientRect().bottom - frame.bottom) < 1 }
  })
  assert(framing && Object.values(framing).every(Boolean), `Spotlight is not one continuous frame: ${JSON.stringify(framing)}`)
  const timing = await page.evaluate(() => Object.fromEntries([
    ['.brand-hero-copy > .eyebrow', '80ms'], ['.brand-hero h1', '180ms'],
    ['.brand-hero-description', '320ms'], ['.hero-search', '440ms']
  ].map(([selector, delay]) => {
    const style = getComputedStyle(document.querySelector(selector))
    return [selector, style.animationDuration === '1.2s' && Number.parseFloat(style.animationDelay) * 1000 === Number.parseFloat(delay)]
  })))
  assert(Object.values(timing).every(Boolean), `Hero entrance timing is inconsistent: ${JSON.stringify(timing)}`)
  checks.push('One full-bleed Spotlight frame with overlay controls, clear CTA, edge progress and 1200ms staggered hero')
  await page.getByRole('button', { name: 'Next spotlight movie' }).click()
  await page.waitForFunction(() => document.querySelector('.spotlight-controls')?.getAttribute('aria-busy') === 'true')
  await page.waitForTimeout(250)
  assert(delayed && await page.locator('.spotlight-slide.is-active h3').textContent() === 'Motion test 1', 'Changed scene before image readiness')
  assert(await page.locator('.spotlight-slide.is-active img').evaluate(el => el.complete && el.naturalWidth > 0), 'Outgoing image disappeared while loading')
  releaseImage()
  await page.waitForFunction(() => document.querySelector('.spotlight-slide.is-active')?.getAttribute('aria-label') === '2 of 5')
  await page.waitForTimeout(200)
  const fade = await page.locator('.spotlight-slide.is-active').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), duration: getComputedStyle(el).transitionDuration }))
  assert(fade.opacity > 0 && fade.opacity < 1 && fade.duration === '1.1s', `Incoming scene did not genuinely crossfade: ${JSON.stringify(fade)}`)
  assert(await page.locator('.spotlight-slide.is-previous').evaluate(el => getComputedStyle(el).opacity) === '1', 'Outgoing scene darkened before crossfade completed')
  checks.push('Decoded incoming image, synchronized content and overlapping 1100ms crossfade without a blank frame')
  await page.waitForTimeout(1200)
  assert(await page.locator('.spotlight-slide.is-previous').count() === 0, 'Outgoing image was not released')
  assert(await page.locator('.spotlight-copy.has-long-title').evaluate(el => {
    const title = el.querySelector('h3').getBoundingClientRect()
    const action = el.querySelector('a').getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return title.top >= box.top && action.bottom <= box.bottom && title.bottom < action.top
  }), 'Long title overlaps or clips the action')
  checks.push('Long-title composition, spacious copy and released outgoing image')
  await page.getByRole('button', { name: 'Next spotlight movie' }).click()
  await page.waitForFunction(() => document.querySelector('.spotlight-controls')?.getAttribute('aria-busy') === 'false')
  assert(await page.locator('.spotlight-slide.is-active h3').textContent() === movie(2).title, 'Failed image replaced the usable scene')
  checks.push('Failed backdrop keeps the existing usable scene')
  const before = requests.filter(path => path.endsWith('/popular')).length
  await page.getByRole('link', { name: 'Discover', exact: true }).click()
  const copy = page.locator('.discover-copy[data-react-bits="animated-content"]')
  await page.waitForFunction(() => document.querySelector('.discover-copy')?.dataset.state === 'entering')
  const entrance = await copy.evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), transform: getComputedStyle(el).transform }))
  assert(entrance.opacity < 1 && entrance.transform !== 'none', 'Official GSAP entrance was not visible')
  await page.waitForFunction(() => document.querySelector('.discover-copy')?.dataset.state === 'visible')
  assert(await page.locator('.discover-results .movie-card').count() === 6, 'Initial Discover picks not mounted')
  assert(requests.filter(path => path.endsWith('/popular')).length === before, 'Discover duplicated the cached popular request')
  assert(!requests.some(path => path.endsWith('/search')), 'Empty query triggered a search')
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(100)
  await page.evaluate(() => scrollTo(0, 0))
  assert(await copy.evaluate(el => getComputedStyle(el).opacity === '1' && getComputedStyle(el).transform === 'none'), 'Entrance replayed while scrolling')
  checks.push('Mounted GSAP Animated Content reveals once; six cached popular picks with no empty search request')
  const panel = page.locator('[data-react-bits="spotlight-card"]')
  await panel.hover({ position: { x: 180, y: 30 } })
  await page.waitForTimeout(500)
  const light = page.locator('.spotlight-card__light')
  const first = await light.evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), background: el.style.background }))
  assert(first.opacity > 0 && first.opacity <= .091 && first.background.includes('radial-gradient'), 'Subtle pointer light not visible')
  await panel.hover({ position: { x: 600, y: 30 } })
  await page.waitForTimeout(500)
  assert(await light.evaluate(el => el.style.background) !== first.background, 'Pointer light did not follow the pointer')
  checks.push('Mounted React Bits Spotlight Card tracks the pointer with restrained violet illumination')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert(await light.evaluate(el => getComputedStyle(el).display) === 'none', 'Reduced motion left pointer effects enabled')
  assert(await copy.evaluate(el => getComputedStyle(el).opacity === '1'), 'Reduced motion hid content')
  await page.goto(base)
  await page.locator('.spotlight-slide.is-active').waitFor()
  assert(await page.locator('.spotlight-slide.is-active').evaluate(el => getComputedStyle(el).transitionDuration) === '0s', 'Reduced-motion carousel still fades')
  checks.push('Reduced motion immediately shows content and disables pointer and scene transitions')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(base + '/discover')
    await page.locator('.movie-card').first().waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Discover overflow at ' + width)
  }
  checks.push('Discover initial composition fits 360/768/1024/1440px')
  await page.setViewportSize({ width: 360, height: 844 })
  await page.goto(base)
  await page.locator('.spotlight-slide.is-active').waitFor()
  await page.getByRole('button', { name: `Show ${movie(2).title}` }).click()
  await page.waitForFunction(() => document.querySelector('.spotlight-slide.is-active')?.getAttribute('aria-label') === '2 of 5')
  assert(await page.evaluate(() => {
    const controls = document.querySelector('.spotlight-controls').getBoundingClientRect()
    const action = document.querySelector('.spotlight-slide.is-active .spotlight-copy a').getBoundingClientRect()
    const stage = document.querySelector('.spotlight-stage').getBoundingClientRect()
    const image = document.querySelector('.spotlight-slide.is-active .spotlight-art').getBoundingClientRect()
    return action.bottom + 12 <= controls.top && image.bottom === stage.bottom && document.documentElement.scrollWidth <= innerWidth
  }), 'Mobile long-title layout overlaps the overlaid controls or loses the backdrop')
  checks.push('Mobile long title and CTA stay clear of full-bleed controls')
  await page.unroute('**/api/v1/**')
  await page.unroute('**/image.tmdb.org/**')
  return { passed: checks.length, checks }
}
