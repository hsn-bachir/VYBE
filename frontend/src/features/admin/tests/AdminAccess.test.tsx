import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api, errorDetails } from '../../../lib/api/client'
import { RequireAdmin, RequireAuth } from '../../auth/guards/AuthGuards'
import { canEnterAdmin } from '../../auth/guards/access'
import { accessKey, currentAccess } from '../../auth/hooks/useAccess'

const user = { id: 4, username: 'cinephile', email: 'fan@example.com', avatar_url: null, email_verified_at: '2026-11-03T00:00:00Z' }

function render(role: 'user' | 'moderator' | 'admin', account_status: 'active' | 'restricted' = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['auth', 'me'], user)
  client.setQueryData(accessKey(user.id), { role, account_status })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin']}>
    <Routes><Route element={<RequireAuth />}><Route element={<RequireAdmin />}><Route path="/admin" element={<p>Private tools</p>} /></Route></Route></Routes>
  </MemoryRouter></QueryClientProvider>)
}

describe('administration access', () => {
  it('uses a user-scoped access key and forwards cancellation', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: { role: 'admin', account_status: 'active' } } })
    const controller = new AbortController()
    expect(accessKey(4)).not.toEqual(accessKey(5))
    expect(await currentAccess(controller.signal)).toEqual({ role: 'admin', account_status: 'active' })
    expect(spy).toHaveBeenCalledWith('/api/v1/me/access', { signal: controller.signal })
    spy.mockRestore()
  })

  it('requires a fresh server access check before showing the route and accepts both privileged roles', () => {
    expect(render('admin')).toContain('Checking admin access')
    expect(render('admin')).not.toContain('Private tools')
    expect(canEnterAdmin({ role: 'admin', account_status: 'active' })).toBe(true)
    expect(canEnterAdmin({ role: 'moderator', account_status: 'restricted' })).toBe(true)
    expect(canEnterAdmin({ role: 'user', account_status: 'active' })).toBe(false)
    expect(canEnterAdmin({ role: 'admin', account_status: 'banned' })).toBe(false)
  })

  it('shows a permission error instead of a connection error for 403', () => {
    expect(errorDetails({ isAxiosError: true, response: { status: 403, data: { code: 'FORBIDDEN' } } }).message).toContain('permission')
    expect(errorDetails({ isAxiosError: true, response: { status: 403, data: { code: 'ACCOUNT_RESTRICTED' } } }).message).toContain('restricted')
  })
})
