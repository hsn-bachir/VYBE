import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { nightAccessVersion, requestContext, subscribeNightAccess } from './cache'

// Components using this boundary are keyed by owner and route event ID. Revocation unmounts their forms.
export function useNightBoundary(owner: number, id?: number) {
  const client = useQueryClient()
  const [context] = useState(() => requestContext(client, owner, id))
  useSyncExternalStore(listener => subscribeNightAccess(client, listener), () => nightAccessVersion(client, owner, id), () => nightAccessVersion(client, owner, id))
  return context
}
export function useNightClock(startsAt?: string) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => setNow(Date.now())
    const delta = startsAt ? Date.parse(startsAt) - Date.now() : NaN
    if (startsAt && delta <= 0 && now < Date.parse(startsAt)) update()
    const timer = delta > 0 ? window.setTimeout(update, Math.min(delta + 1, 2147483647)) : undefined
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [startsAt, now])
  return now
}
