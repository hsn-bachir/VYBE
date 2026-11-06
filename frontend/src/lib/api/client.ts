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
  const code = error.response?.data?.code
  const messages: Record<number, string> = {
    401: 'Invalid email or password.',
    419: 'Your session expired. Please submit again to refresh your session.',
    429: 'Too many attempts. Please wait a minute before trying again.',
    500: 'The server could not complete this request. Please try again shortly.',
    502: 'The service is temporarily unavailable. Please try again shortly.',
    503: 'The service is temporarily unavailable. Please try again shortly.',
    504: 'The service took too long to respond. Please try again shortly.',
  }
  return {
    message: status === 422 ? 'Please check the highlighted fields.' : status === 403 ? code === 'ACCOUNT_RESTRICTED' ? 'This account is restricted from community contributions.' : code === 'ACCOUNT_BANNED' ? 'This account is banned.' : code === 'ACCOUNT_DEACTIVATED' ? 'This account is deactivated.' : 'You do not have permission to do that.' : messages[status ?? 0] || 'Unable to connect. Please try again shortly.',
    fields: status === 422 ? error.response?.data?.errors ?? {} : {},
  }
}
