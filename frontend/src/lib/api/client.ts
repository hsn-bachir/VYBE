import axios from 'axios'

// Root URL: the CSRF endpoint is deliberately outside /api/v1.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json' },
  timeout: 15000,
})

export function errorDetails(error: unknown): { message: string; fields: Record<string, string[]> } {
  if (!axios.isAxiosError(error)) return { message: 'Something went wrong. Please try again.', fields: {} }
  const status = error.response?.status
  const messages: Record<number, string> = {
    401: 'Invalid email or password.',
    419: 'Your session expired. Please submit again to refresh your session.',
    429: 'Too many attempts. Please wait a minute before trying again.',
  }
  return {
    message: status === 422 ? 'Please check the highlighted fields.' : messages[status ?? 0] || 'Unable to connect. Please try again shortly.',
    fields: status === 422 ? error.response?.data?.errors ?? {} : {},
  }
}
