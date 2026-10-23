export interface User {
  id: number
  username: string
  email: string
  avatar_url: string | null
  email_verified_at: string | null
}

export interface Credentials { email: string; password: string }
export interface Registration extends Credentials { username: string; password_confirmation: string }
