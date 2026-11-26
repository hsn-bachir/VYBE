import { useLayoutEffect, useRef, useState } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { movieNightError } from '../api/errors'
import { nightKeys, requestContext } from './cache'
import { acquireNightCommand } from './commandExclusion'
import { nightOptions, useMovieNightMutation, type NightMutation } from './useMovieNights'

type ContentAction = Extract<NightMutation, { kind: 'nominate' | 'remove' | 'vote' | 'finalize' }>
// Presentation may retire while the server command remains unresolved. Reconciliation belongs to the hook.
export function useNightContentCommand(owner: number, id: number, allowed: boolean, presentation: string | number | null = null) {
  const client = useQueryClient(), mutation = useMovieNightMutation()
  const locked = useRef(false), attempt = useRef<{ current: boolean } | null>(null)
  const [conflict, setConflict] = useState(0)
  const [error, setError] = useState(''), [previous, setPrevious] = useState(allowed), [previousPresentation, setPreviousPresentation] = useState(presentation)
  if (previous !== allowed || previousPresentation !== presentation) {
    setPrevious(allowed); setPreviousPresentation(presentation); setError('')
  }
  const pending = useIsMutating({ mutationKey: nightKeys.owner(owner), predicate: entry => {
    const variables = entry.state.variables as NightMutation | undefined
    return !!variables && 'id' in variables && variables.id === id && ['nominate', 'remove', 'vote', 'finalize'].includes(variables.kind)
  } }) > 0
  // A closed/replaced dialog retires its command UI even if the event itself stays open.
  useLayoutEffect(() => { if (attempt.current) attempt.current.current = false }, [allowed, presentation])
  useLayoutEffect(() => () => { if (attempt.current) attempt.current.current = false }, [])
  const run = async (action: ContentAction, admit?: () => boolean) => {
    if (!allowed || locked.current || pending) return false
    const context = requestContext(client, owner, id)
    if (!context.isCurrent()) return false
    if (action.kind === 'finalize') {
      if (!admit?.()) return false
      const votes = client.getQueryState(nightOptions(client, owner, { kind: 'votes', id }).queryKey)
      if (votes?.status !== 'success' || votes.isInvalidated || votes.fetchStatus !== 'idle'
        || !votes.data || votes.data.total_votes < 1 || !votes.data.leaders.length) return false
    }
    const release = acquireNightCommand(client, owner, id)
    if (!release) return false
    locked.current = true; setError('')
    const presentation = { current: true }; attempt.current = presentation
    try {
      await mutation.mutateAsync(action)
      return presentation.current && context.isCurrent()
    } catch (failure) {
      if (presentation.current && context.isCurrent()) {
        const info = movieNightError(failure)
        if (action.kind === 'finalize' && info.refresh) setConflict(value => value + 1)
        setError(info.fields.tmdb_id?.[0] ?? info.fields.movie_night_movie_id?.[0] ?? info.message)
      }
      return false
    } finally { locked.current = false; release() }
  }
  return { run, pending, conflict, error: allowed ? error : '', clearError: () => setError('') }
}
