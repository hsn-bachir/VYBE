import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserPopupRedirectResolver, inMemoryPersistence, initializeAuth } from 'firebase/auth'

let auth: ReturnType<typeof initializeAuth> | undefined

export function firebaseAuth() {
  if (auth) return auth
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const appId = import.meta.env.VITE_FIREBASE_APP_ID
  if (!apiKey || !authDomain || !projectId || !appId) throw new Error('Firebase sign-in is not configured.')
  const app = getApps().length ? getApp() : initializeApp({ apiKey, authDomain, projectId, appId })
  auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver })
  return auth
}
