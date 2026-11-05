import type { User } from '../types/auth.types'
import type { Access } from '../hooks/useAccess'

export function canEnterAdmin(access: Access): boolean {
  return ['admin', 'moderator'].includes(access.role) && ['active', 'restricted'].includes(access.account_status)
}

export function accessDestination(user: User | null, protectedRoute: boolean): string | null {
  if (!user) return protectedRoute ? '/login' : null
  return user.email_verified_at ? null : '/verify-email'
}
