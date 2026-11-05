// Stateful API fixture for the M3.1A browser flow. Core integration is tested separately.
export async function runAccessChecks(page, base, screenshots) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const accounts = {
    'admin@example.test': { id: 11, role: 'admin', account_status: 'active' },
    'moderator@example.test': { id: 12, role: 'moderator', account_status: 'active' },
    'user@example.test': { id: 13, role: 'user', account_status: 'active' },
  }
  let current = null
  const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
  const user = () => ({ id: current.id, username: `movie_${current.id}`, email: current.email, avatar_url: null, email_verified_at: '2026-11-03T00:00:00Z' })
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204, headers }))
  await page.route('**/api/v1/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const reply = (body, status = 200) => route.fulfill({ status, headers, json: body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path.endsWith('/auth/login')) {
      const email = request.postDataJSON().email
      current = accounts[email] ? { ...accounts[email], email } : null
      return current ? reply({ data: user() }) : reply({ message: 'Invalid email or password.' }, 401)
    }
    if (path.endsWith('/auth/logout')) { current = null; return route.fulfill({ status: 204, headers }) }
    if (path.endsWith('/auth/me')) {
      if (!current) return reply({ message: 'Unauthenticated.' }, 401)
      if (current.account_status === 'banned') return reply({ message: 'This account cannot access VYBE.', code: 'ACCOUNT_BANNED' }, 403)
      return reply({ data: user() })
    }
    if (path.endsWith('/me/access')) return current ? reply({ data: { role: current.role, account_status: current.account_status } }) : reply({ message: 'Unauthenticated.' }, 401)
    if (path.endsWith('/movies/popular')) return reply({ data: [], meta: { page: 1, per_page: 20, total_pages: 0, total_results: 0 } })
    return reply({ message: 'Not found.' }, 404)
  })
  const login = async email => {
    await page.goto(`${base}/login`)
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill('FixturePassword123!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(base + '/')
  }
  await page.goto(`${base}/admin`)
  await page.waitForURL(base + '/login')
  await login('admin@example.test')
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await page.getByRole('heading', { name: 'Administration', exact: true }).waitFor()
  if (screenshots) {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw Error(`Admin layout overflows at ${width}px`)
      await page.screenshot({ path: `${screenshots}/admin-${width}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 375, height: 812 })
  }
  await page.reload()
  await page.getByRole('heading', { name: 'Administration', exact: true }).waitFor()
  current.account_status = 'banned'
  await page.reload()
  await page.getByRole('heading', { name: 'Account unavailable' }).waitFor()
  await page.getByText('This account is banned.').waitFor()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('form', { name: 'Login' }).waitFor()
  await login('moderator@example.test')
  await page.getByRole('link', { name: 'Moderation', exact: true }).click()
  await page.getByRole('heading', { name: 'Moderation', exact: true }).waitFor()
  if (screenshots) await page.screenshot({ path: `${screenshots}/moderation-375.png`, fullPage: true })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await login('user@example.test')
  if (await page.getByRole('link', { name: 'Admin', exact: true }).count()) throw Error('Ordinary user sees Admin link')
  await page.goto(`${base}/admin`)
  await page.getByRole('heading', { name: 'Access denied' }).waitFor()
  if (errors.length) throw Error(errors.join('\n'))
  return { checks: 'guest redirect; admin and moderator landing; refresh; retained banned session; logout/account switch; ordinary-user denial', pageErrors: errors }
}
