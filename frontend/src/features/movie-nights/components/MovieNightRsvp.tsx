import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAccess } from '../../auth/hooks/useAccess'
import { movieNightError } from '../api/errors'
import { nightKeys, requestContext } from '../hooks/cache'
import { nightOptions, useMovieNightMutation } from '../hooks/useMovieNights'
import { useNightBoundary, useNightClock } from '../hooks/useNightBoundary'
import { dashboardState } from '../lib/dashboardState'
import { nightPermissions } from '../lib/permissions'
import type { NightSummary } from '../types/movieNight.types'

export function MovieNightRsvp({ night, detail = false }: { night: NightSummary; detail?: boolean }) {
  const { data: user } = useAuth(), owner = user?.id ?? 0
  const access = useAccess(owner, !!user?.email_verified_at)
  const boundary = useNightBoundary(owner, night.id)
  const now = useNightClock(night.starts_at)
  const client = useQueryClient(), navigate = useNavigate(), location = useLocation()
  const receipt = useRef({ confirmed: false })
  const mutation = useMovieNightMutation(receipt)
  const pending = useIsMutating({ mutationKey: nightKeys.owner(owner), predicate: entry => {
    const action = entry.state.variables as { kind?: string; id?: number } | undefined
    return action?.kind === 'rsvp' && action.id === night.id
  } }) > 0
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submitting = useRef(false), mounted = useRef(true)
  const attempt = useRef<{ present: boolean; navigate: boolean } | null>(null)
  const permitted = !access.isError && nightPermissions(user, access.data, night, now).rsvp
  const allowed = boundary.isCurrent() && permitted
  const [wasAllowed, setWasAllowed] = useState(allowed)
  // Presentation resets independently of the unresolved command and its submission lock.
  if (wasAllowed !== allowed) {
    setWasAllowed(allowed); setError(''); setConfirm(false); setBusy(false)
  }
  useLayoutEffect(() => {
    if (!permitted || !boundary.isCurrent() && !receipt.current.confirmed) {
      if (attempt.current) { attempt.current.present = false; attempt.current.navigate = false }
    }
  }, [permitted, boundary, allowed])
  useLayoutEffect(() => {
    mounted.current = true
    const commandReceipt = receipt.current
    return () => {
      mounted.current = false
      if (attempt.current) {
        attempt.current.present = false
        // The successful command marks its receipt before purging/unmounting private UI.
        // All other unmounts (including leaving and returning to the same URL) revoke navigation.
        if (!commandReceipt.confirmed) attempt.current.navigate = false
      }
    }
  }, [])
  if (!allowed) return null
  const respond = async (status: 'accepted' | 'declined') => {
    if (submitting.current || pending || !boundary.isCurrent()) return
    submitting.current = true; receipt.current.confirmed = false
    const completion = { present: true, navigate: true }; attempt.current = completion
    setBusy(true); setError('')
    // RSVP deliberately revokes the event generation and resets mounted mutation observers.
    // Await the command promise; completion is guarded by the session, not that revoked event.
    const session = requestContext(client, owner)
    try {
      const result = await mutation.mutateAsync({ kind: 'rsvp', id: night.id, status })
      if (!session.isCurrent() || (!result || !('rsvp_status' in result))) return
      // Reconcile confirmed membership even if permission loss retired this presentation.
      // The hook already purged private data; refresh a currently visible dashboard from Core.
      const here = window.location.pathname + window.location.search
      const state = dashboardState(new URLSearchParams(window.location.search))
      if (window.location.pathname === '/movie-nights' && state.valid) {
        const request = state.view === 'invitations' ? { kind: 'received' as const, page: { page: state.page, per_page: 12 } }
          : { kind: 'list' as const, filters: { page: state.page, per_page: 12, ...(state.status !== 'all' ? { status: state.status } : {}) } }
        void client.fetchQuery(nightOptions(client, owner, request)).catch(() => {})
      }
      if (!completion.navigate || here !== location.pathname + location.search) return
      if (result.rsvp_status === 'accepted') {
        // No summary promotion: a newly mounted, authorized detail query supplies private fields.
        navigate(`/movie-nights/${night.id}`)
      } else if (detail) navigate('/movie-nights?view=invitations', { replace: true })
    } catch (failure) {
      if (session.isCurrent()) {
        if (completion.present && mounted.current && boundary.isCurrent()) setError(movieNightError(failure).message)
        if (movieNightError(failure).refresh) {
          void client.invalidateQueries({ queryKey: nightKeys.lists(owner) })
          void client.invalidateQueries({ queryKey: nightKeys.inbox(owner) })
        }
      }
    } finally {
      submitting.current = false
      if (completion.present && mounted.current && session.isCurrent()) { setBusy(false); setConfirm(false) }
    }
  }
  return <div className="night-response" role="group" aria-label={`RSVP for ${night.title}`}>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="night-response-actions">
      {night.my_rsvp !== 'accepted' && <Button className="primary" disabled={busy || pending} onClick={() => void respond('accepted')}>{busy ? 'Updating…' : 'Accept invitation'}</Button>}
      {night.my_rsvp !== 'declined' && <Button disabled={busy || pending} onClick={() => night.my_rsvp === 'accepted' ? setConfirm(true) : void respond('declined')}>{busy ? 'Updating…' : night.my_rsvp === 'accepted' ? 'Change to declined' : 'Decline invitation'}</Button>}
    </div>
    {confirm && <DeclineConfirmation busy={busy || pending} onClose={() => setConfirm(false)} onConfirm={() => void respond('declined')} />}
  </div>
}
function DeclineConfirmation({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => { keep.current?.focus() }, [])
  return <Dialog title="Decline this invitation?" busy={busy} onClose={onClose}>
    <p className="night-dialog-copy">You’ll lose access to private event details and your existing vote will be removed. Accepting again will not restore your vote.</p>
    <div className="night-form-actions"><Button ref={keep} disabled={busy} onClick={onClose}>Keep accepted</Button><Button className="destructive" disabled={busy} onClick={onConfirm}>{busy ? 'Updating…' : 'Confirm decline'}</Button></div>
  </Dialog>
}
