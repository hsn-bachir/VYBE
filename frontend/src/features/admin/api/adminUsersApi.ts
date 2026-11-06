import axios from 'axios'
import { api, errorDetails } from '../../../lib/api/client'

export type Role = 'user' | 'moderator' | 'admin'
export type AccountStatus = 'active' | 'restricted' | 'banned' | 'deactivated'
export type AdminUser = {
  id: number; username: string; email: string; email_verified_at: string | null
  role: Role; account_status: AccountStatus; invitation_pending: boolean; created_at: string; updated_at: string
}
export type InvitationDelivery = 'accepted' | 'pending'
export type CreatedAdminUser = { user: AdminUser; invitation_delivery: InvitationDelivery }
export type UserFilters = { page: number; per_page: number; q: string; role: Role | ''; account_status: AccountStatus | '' }
export type UserPage = { data: AdminUser[]; meta: { page: number; per_page: number; total_pages: number; total_results: number } }
export type UserChange =
  | { kind: 'edit'; id: number; values: { username?: string; email?: string } }
  | { kind: 'role'; id: number; values: { role: 'user' | 'moderator'; reason?: string } }
  | { kind: 'status'; id: number; values: { account_status: AccountStatus; reason?: string } }
export type PasswordChange = { admin_current_password: string; password: string; password_confirmation: string; reason?: string }
export type ResetDelivery = 'accepted' | 'pending'

const path = '/api/v1/admin/users'
export async function adminUsers(filters: UserFilters, signal?: AbortSignal): Promise<UserPage> {
  const params = { ...filters, q: filters.q || undefined, role: filters.role || undefined, account_status: filters.account_status || undefined }
  return (await api.get<UserPage>(path, { params, signal })).data
}
export async function adminUser(id: number, signal?: AbortSignal): Promise<AdminUser> {
  return (await api.get<{ data: AdminUser }>(`${path}/${id}`, { signal })).data.data
}
export async function changeAdminUser(change: UserChange, isCurrent: () => boolean): Promise<AdminUser> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  const url = `${path}/${change.id}`
  const result = change.kind === 'edit'
    ? await api.patch<{ data: AdminUser }>(url, change.values)
    : await api.put<{ data: AdminUser }>(`${url}/${change.kind}`, change.values)
  return result.data.data
}
export async function createAdminUser(values: { username: string; email: string }, isCurrent: () => boolean): Promise<CreatedAdminUser> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  return (await api.post<{ data: CreatedAdminUser }>(path, values)).data.data
}
export async function resendAdminInvitation(id: number, isCurrent: () => boolean): Promise<InvitationDelivery> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  return (await api.post<{ data: { invitation_delivery: InvitationDelivery } }>(`${path}/${id}/invitation`)).data.data.invitation_delivery
}
export async function changeAdminPassword(id: number, values: PasswordChange, isCurrent: () => boolean): Promise<void> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  await api.put(`${path}/${id}/password`, values)
}
export async function sendAdminPasswordReset(id: number, reason: string | undefined, isCurrent: () => boolean): Promise<ResetDelivery> {
  await api.get('/sanctum/csrf-cookie')
  if (!isCurrent()) throw new Error('The signed-in account changed. Please sign in again.')
  return (await api.post<{ data: { reset_delivery: ResetDelivery } }>(`${path}/${id}/password-reset`, reason ? { reason } : {})).data.data.reset_delivery
}
export function adminError(error: unknown) {
  if (!axios.isAxiosError(error)) return errorDetails(error)
  const status = error.response?.status
  if (status === 401) return { message: 'Your session expired. Sign in again.', fields: {} }
  if (status === 404) return { message: 'This account is no longer available.', fields: {} }
  if (status === 409) return { message: error.response?.data?.message || 'This account state changed. Refresh and try again.', fields: {} }
  return errorDetails(error)
}
