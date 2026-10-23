import type { User } from '../types/auth.types'

export function accessDestination(user: User | null, protectedRoute: boolean): string | null {
  if (!user) return protectedRoute ? '/login' : null
  return user.email_verified_at ? null : '/verify-email'
}
