import { lazy, Suspense, useState } from 'react'
import { useIsMutating, useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { collectionError } from '../api/collectionsApi'
import { collectionKeys, collectionsOptions, useCollectionMutation } from '../hooks/useCollections'

const SaveCollectionDialog = lazy(() => import('./SaveCollectionDialog'))
function FavoritesAction({ owner, movie }: { owner: number; movie: number }) {
  const [feedback, setFeedback] = useState('')
  const list = useQuery(collectionsOptions(owner, 1, movie, false))
  const favorite = list.data?.data.find(collection => collection.system_key === 'favorites')
  const mutation = useCollectionMutation(owner, (_, operation) => {
    if (operation.action === 'membership') setFeedback(operation.add ? 'Added to Favorites.' : 'Removed from Favorites.')
  }, { id: favorite?.id ?? 0, movie })
  const busy = useIsMutating({ mutationKey: collectionKeys.membership(owner, favorite?.id ?? 0, movie) }) > 0
  const selected = favorite?.contains_movie === true
  return <div className="membership-control">
    <Button className={`membership-button favorite-button ${selected ? 'is-saved' : ''}`} aria-pressed={selected} disabled={!favorite || busy} onClick={() => {
      if (favorite && !busy) { setFeedback(''); mutation.mutate({ action: 'membership', id: favorite.id, tmdbId: movie, add: !selected }) }
    }}><span aria-hidden="true">{selected ? '♥' : '♡'}</span>{busy ? 'Saving…' : selected ? 'In Favorites' : 'Add to Favorites'}</Button>
    {feedback && <p className="action-feedback" role="status">{feedback}</p>}
    {mutation.isError && <p className="action-feedback" role="alert">{collectionError(mutation.error, true)}</p>}
    {list.isError && <p className="action-feedback" role="alert">Favorites unavailable. <button onClick={() => void list.refetch()}>Retry</button></p>}
  </div>
}
export function SaveCollectionAction({ owner, movie, title }: { owner: number; movie: number; title: string }) {
  const [open, setOpen] = useState(false)
  return <><FavoritesAction owner={owner} movie={movie} /><div className="membership-control"><Button className="membership-button" onClick={() => setOpen(true)}>＋ Save to collection</Button>
    {open && <Suspense fallback={<p role="status">Opening collections…</p>}><SaveCollectionDialog owner={owner} movie={movie} title={title} onClose={() => setOpen(false)} /></Suspense>}
  </div></>
}
