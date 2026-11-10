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
  if (error instanceof Error && error.message === 'Firebase sign-in is not configured.') return { message: error.message, fields: {} }
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code.startsWith('auth/')) {
    const message = error.code === 'auth/email-already-in-use' ? 'This email is already registered with Firebase.'
      : error.code === 'auth/account-exists-with-different-credential' ? 'An account with this email uses another sign-in method. Sign in with that method, then connect this provider from your profile.'
        : error.code === 'auth/credential-already-in-use' ? 'This provider is connected to another Firebase account. Contact support; accounts cannot be merged automatically.'
          : error.code === 'auth/provider-already-linked' ? 'This sign-in method is already connected.'
            : error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request' ? 'Sign-in cancelled. You can try again.'
              : error.code === 'auth/popup-blocked' ? 'Your browser blocked the sign-in popup. Allow popups and try again.'
                : error.code === 'auth/requires-recent-login' ? 'Confirm your current sign-in method again, then retry.'
                  : error.code === 'auth/invalid-credential' ? 'Provider sign-in failed. Please try again.'
                : error.code === 'auth/operation-not-allowed' || error.code === 'auth/unauthorized-domain' ? 'This sign-in provider is not configured for this site.'
      : error.code === 'auth/weak-password' ? 'Choose a stronger password.'
        : error.code === 'auth/too-many-requests' ? 'Too many attempts. Please try again later.'
          : error.code === 'auth/network-request-failed' ? 'The authentication service is temporarily unavailable.'
            : error.code === 'auth/invalid-email' ? 'Enter a valid email address.'
              : 'Invalid email or password.'
    return { message, fields: {} }
  }
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
    message: status === 409 && code === 'IDENTITY_CONFLICT' ? 'This Firebase account conflicts with an existing VYBE account. Contact support to link them.' : status === 409 && code === 'SESSION_ALREADY_ACTIVE' ? 'Sign out before signing in as another account.' : status === 422 && code === 'EMAIL_REQUIRED' ? 'This provider did not share a usable email address. Add a verified email to the provider account and try again, or use another sign-in method.' : status === 422 && code === 'RESET_LINK_INVALID' ? 'This reset link is invalid or expired.' : status === 422 ? 'Please check the highlighted fields.' : status === 403 && code === 'IDENTITY_MISMATCH' ? 'That Firebase sign-in belongs to a different VYBE account. Confirm your current account instead.' : status === 403 ? code === 'ACCOUNT_RESTRICTED' ? 'This account is restricted from community contributions.' : code === 'ACCOUNT_BANNED' ? 'This account is banned.' : code === 'ACCOUNT_DEACTIVATED' ? 'This account is deactivated.' : 'You do not have permission to do that.' : messages[status ?? 0] || 'Unable to connect. Please try again shortly.',
    fields: status === 422 ? error.response?.data?.errors ?? {} : {},
  }
}
