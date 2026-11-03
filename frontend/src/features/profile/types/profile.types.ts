import type { User } from '../../auth/types/auth.types'
export interface Profile { user: User; bio: string | null; member_since: string | null; statistics: { watched_count: number; watchlist_count: number; review_count: number } }
export interface ProfileValues { username: string; bio: string | null }
export type ProfileOperation = { action: 'edit'; values: ProfileValues } | { action: 'upload'; file: File } | { action: 'remove' }
