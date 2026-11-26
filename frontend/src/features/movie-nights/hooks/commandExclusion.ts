import type { QueryClient } from '@tanstack/react-query'
import { nightAccessVersion } from './cache'

// Admission is synchronous across hook instances, independent of React/observer notifications.
// An old session's unresolved command must not block or unlock a newly authorized generation.
const clients = new WeakMap<QueryClient, Map<string, symbol>>()
export function acquireNightCommand(client: QueryClient, owner: number, id: number) {
  let locks = clients.get(client)
  if (!locks) { locks = new Map(); clients.set(client, locks) }
  const key = `${owner}:${id}:${nightAccessVersion(client, owner, id)}`
  if (locks.has(key)) return undefined
  const token = Symbol()
  locks.set(key, token)
  return () => { if (locks.get(key) === token) locks.delete(key) }
}
