import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { RequireUserManager } from '../../auth/guards/AuthGuards'
import { accessKey } from '../../auth/hooks/useAccess'
import { authKey } from '../../auth/hooks/useAuth'
import { adminError, adminUser, adminUsers, changeAdminUser, changeAdminPassword, createAdminUser, resendAdminInvitation, sendAdminPasswordReset, type AdminUser, type UserFilters } from '../api/adminUsersApi'
import { adminKeys } from '../hooks/useAdminUsers'
import { PasswordManagementDialog } from '../components/PasswordManagementDialog'
import AdminUsersPage from '../pages/AdminUsersPage'
import AdminUserDetailsPage from '../pages/AdminUserDetailsPage'

const actor = { id: 4, username: 'admin_user', email: 'admin@example.test', email_verified_at: '2026-11-03T00:00:00Z', avatar_url: null }
const target: AdminUser = { id: 9, username: 'cine_fan', email: 'fan@example.test', email_verified_at: null, role: 'user', account_status: 'active', invitation_pending: true, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' }
const filters: UserFilters = { page: 1, per_page: 20, q: '', role: '', account_status: '' }
function render(path: string, role: 'admin' | 'moderator' = 'admin', entries: AdminUser[] = [target], detail: AdminUser = target, actorStatus: 'active' | 'restricted' = 'active') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(authKey, actor)
  client.setQueryData(accessKey(actor.id), { role, account_status: actorStatus })
  client.setQueryData(adminKeys.users(actor.id, filters), { data: entries, meta: { page: 1, per_page: 20, total_pages: 1, total_results: entries.length } })
  client.setQueryData(adminKeys.user(actor.id, target.id), detail)
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={{ role, account_status: actorStatus }} />}><Route element={<RequireUserManager />}>
      <Route path="/admin/users" element={<AdminUsersPage />} /><Route path="/admin/users/:id" element={<AdminUserDetailsPage />} />
    </Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('admin user management', () => {
  it('renders the real list projection, duplicate names by ID, and empty state', () => {
    const html = render('/admin/users', 'admin', [target, { ...target, id: 10 }])
    expect(html).toContain('User Management')
    expect(html).toContain('Create account')
    expect(html).toContain('Invitation pending')
    expect(html).toContain('fan@example.test')
    expect(html).toContain('/admin/users/9')
    expect(html).toContain('/admin/users/10')
    expect(render('/admin/users', 'admin', [])).toContain('No accounts match')
  })

  it('renders account details and denies moderators even with cached user data', () => {
    expect(render('/admin/users/9')).toContain('Email verification')
    expect(render('/admin/users/9')).toContain('Change role')
    expect(render('/admin/users/9')).toContain('Resend invitation')
    expect(render('/admin/users/9', 'moderator')).toContain('Access denied')
    expect(render('/admin/users/9', 'moderator')).not.toContain('fan@example.test')
  })

  it('keys private queries by actor and all filters', () => {
    expect(adminKeys.users(4, filters)).not.toEqual(adminKeys.users(5, filters))
    expect(adminKeys.users(4, filters)).not.toEqual(adminKeys.users(4, { ...filters, role: 'moderator' }))
    expect(adminKeys.user(4, 9)).not.toEqual(adminKeys.user(4, 10))
  })

  it('uses cancellable bounded reads and blocks writes after account switch', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [target], meta: {} } })
    const controller = new AbortController()
    await adminUsers(filters, controller.signal)
    expect(get).toHaveBeenCalledWith('/api/v1/admin/users', { params: { ...filters, q: undefined, role: undefined, account_status: undefined }, signal: controller.signal })
    get.mockResolvedValueOnce({ data: { data: target } })
    expect(await adminUser(9, controller.signal)).toEqual(target)
    await expect(changeAdminUser({ kind: 'role', id: 9, values: { role: 'moderator', reason: 'Help' } }, () => false)).rejects.toThrow('account changed')
    get.mockRestore()
  })

  it('reports admin errors without a misleading connection message', () => {
    expect(adminError({ isAxiosError: true, response: { status: 409, data: { message: 'Last admin must remain active.' } } }).message).toContain('Last admin')
    expect(adminError({ isAxiosError: true, response: { status: 401 } }).message).toContain('session')
  })

  it('uses CSRF and account identity checks for creation and resend', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { user: target, invitation_delivery: 'accepted' } } })
    expect(await createAdminUser({ username: target.username, email: target.email }, () => true)).toEqual({ user: target, invitation_delivery: 'accepted' })
    expect(post).toHaveBeenCalledWith('/api/v1/admin/users', { username: target.username, email: target.email })
    post.mockResolvedValueOnce({ data: { data: { invitation_delivery: 'pending' } } })
    expect(await resendAdminInvitation(target.id, () => true)).toBe('pending')
    expect(post).toHaveBeenCalledWith(`/api/v1/admin/users/${target.id}/invitation`)
    post.mockClear()
    await expect(createAdminUser({ username: target.username, email: target.email }, () => false)).rejects.toThrow('account changed')
    expect(post).not.toHaveBeenCalled()
    get.mockRestore(); post.mockRestore()
  })

  it('shows password management only for eligible active administrators and accounts', () => {
    const eligible = { ...target, invitation_pending: false }
    expect(render('/admin/users/9', 'admin', [eligible], eligible)).toContain('Password management')
    expect(render('/admin/users/9')).not.toContain('Password management')
    expect(render('/admin/users/9', 'admin', [eligible], { ...eligible, role: 'admin' })).not.toContain('Password management')
    expect(render('/admin/users/9', 'admin', [eligible], eligible, 'restricted')).not.toContain('Password management')
    expect(render('/admin/users/9', 'moderator', [eligible], eligible)).not.toContain('Password management')
  })

  it('keeps password fields masked and guards privileged mutations across account changes', async () => {
    const html = renderToStaticMarkup(<PasswordManagementDialog mode="change" user={{ ...target, invitation_pending: false }} pending={false}
      onClose={() => undefined} onDone={() => undefined} onChange={async () => undefined} onReset={async () => 'accepted'} />)
    expect(html).toContain('Your administrator password')
    expect(html).toContain('Confirm new password')
    expect(html.match(/type="password"/g)).toHaveLength(3)
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { reset_delivery: 'accepted' } } })
    const values = { admin_current_password: 'admin-password', password: 'newPassword123!', password_confirmation: 'newPassword123!', reason: 'Recovery' }
    await expect(changeAdminPassword(9, values, () => false)).rejects.toThrow('account changed')
    expect(put).not.toHaveBeenCalled()
    await changeAdminPassword(9, values, () => true)
    expect(put).toHaveBeenCalledWith('/api/v1/admin/users/9/password', values)
    await expect(sendAdminPasswordReset(9, 'Recovery', () => false)).rejects.toThrow('account changed')
    expect(post).not.toHaveBeenCalled()
    expect(await sendAdminPasswordReset(9, 'Recovery', () => true)).toBe('accepted')
    expect(post).toHaveBeenCalledWith('/api/v1/admin/users/9/password-reset', { reason: 'Recovery' })
    get.mockRestore(); put.mockRestore(); post.mockRestore()
  })
})
