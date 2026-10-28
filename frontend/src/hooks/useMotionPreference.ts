import { useSyncExternalStore } from 'react'

const preference = '(prefers-reduced-motion: reduce)'
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(preference)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const subscribeVisibility = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify)
  return () => document.removeEventListener('visibilitychange', notify)
}
export const useReducedMotion = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia(preference).matches, () => true)
export const usePageVisible = () => useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true)
