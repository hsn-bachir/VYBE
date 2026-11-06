import { useIsMutating, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { useLibraryAccessError } from '../../library/hooks/useLibrary'
import { collectionError } from '../api/collectionsApi'
import { collectionKeys, collectionsOptions, useCollectionMutation } from '../hooks/useCollections'
import type { Collection } from '../types/collection.types'
import { CollectionDialog } from './CollectionDialog'
import { CollectionForm } from './CollectionForm'
import '../collections.css'

function CollectionChoice({ owner, movie, collection, onConfirmed, savingNew = false }: { owner: number; movie: number; collection: Collection; onConfirmed: (add: boolean) => void; savingNew?: boolean }) {
  const mutation = useCollectionMutation(owner, (_, operation) => { if (operation.action === 'membership') onConfirmed(operation.add) }, { id: collection.id, movie })
  const inFlight = useIsMutating({ mutationKey: collectionKeys.membership(owner, collection.id, movie) }) > 0
  const pending = savingNew || inFlight
  const selected = collection.contains_movie === true
  return <li className={`collection-choice ${selected ? 'is-selected' : ''}`}>
    <label><input type="checkbox" checked={selected} disabled={pending} aria-label={`${collection.name}, collection ${collection.id}`} onChange={() => mutation.mutate({ action: 'membership', id: collection.id, tmdbId: movie, add: !selected })} />
      <span className="collection-choice-copy"><strong>{collection.name}</strong><small>Collection {collection.id} · {collection.movie_count} {collection.movie_count === 1 ? 'movie' : 'movies'}</small></span>
      <span className="collection-choice-state" aria-live="polite">{pending ? 'Saving…' : selected ? 'Saved' : 'Add'}</span>
    </label>
    {mutation.isError && <p role="alert">{collectionError(mutation.error, true)} Select this collection to retry.</p>}
  </li>
}

export default function SaveCollectionDialog({ owner, movie, title, onClose }: { owner: number; movie: number; title: string; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<Collection | null>(null)
  const [feedback, setFeedback] = useState('')
  const listHeading = useRef<HTMLParagraphElement>(null)
  const result = useQuery({ ...collectionsOptions(owner, page, movie), refetchOnMount: 'always' })
  useLibraryAccessError(result.error, owner)
  const saveNew = useCollectionMutation(owner, () => {
    setCreated(old => old ? { ...old, contains_movie: true, movie_count: 1 } : old)
    setFeedback('Collection created and movie saved.')
  }, { id: 0, movie })
  const creatingPending = useIsMutating({ mutationKey: ['library', owner, 'collection-write'], exact: true }) > 0
  const rows = result.data?.data ?? []
  const choices = page === 1 && created && !rows.some(c => c.id === created.id) ? [created, ...rows] : rows
  return <CollectionDialog title={`Save ${title}`} onClose={onClose} busy={creatingPending}>
    {creating ? <div className="collection-inline-create"><p className="collection-dialog-copy">Create a collection, then save this movie to it.</p><CollectionForm owner={owner} createAndSave onCancel={() => setCreating(false)} onSaved={c => {
      setCreating(false); setPage(1); setCreated({ ...c, contains_movie: false }); setFeedback('Collection created. Saving the movie…');
      saveNew.mutate({ action: 'membership', id: c.id, tmdbId: movie, add: true })
    }} /></div> : <>
      <p ref={listHeading} tabIndex={-1} className="collection-dialog-copy">Choose your collections. Each change saves separately.</p>
      {result.isPending ? <p role="status" className="collection-dialog-copy">Loading collections…</p>
        : result.isError ? <div className="collection-dialog-copy" role="alert"><p>{collectionError(result.error)}</p><Button onClick={() => void result.refetch()}>Retry collections</Button></div>
          : <>
            {choices.length ? <ul className="collection-choices">{choices.map(c => <CollectionChoice key={c.id} owner={owner} movie={movie} collection={c} savingNew={created?.id === c.id && saveNew.isPending} onConfirmed={add => {
              setFeedback(`${add ? 'Saved to' : 'Removed from'} ${c.name} (collection ${c.id}).`)
              if (created?.id === c.id) { setCreated({ ...c, contains_movie: add }); saveNew.reset() }
            }} />)}</ul> : <p className="collection-dialog-copy">No collections yet. Create one to give this movie a home.</p>}
            {result.data.meta.total_pages > 1 && <nav className="collection-pagination" aria-label="Collection choices pages"><Button disabled={page <= 1 || result.isFetching} onClick={() => { setPage(p => p - 1); listHeading.current?.focus() }}>Previous</Button><span>Page {page} of {result.data.meta.total_pages}</span><Button disabled={page >= result.data.meta.total_pages || result.isFetching} onClick={() => { setPage(p => p + 1); listHeading.current?.focus() }}>Next</Button></nav>}
          </>}
      <div className="collection-dialog-actions"><Button disabled={saveNew.isPending} onClick={() => { saveNew.reset(); setCreating(true) }}>＋ Create new collection</Button><Button className="primary" onClick={onClose}>Done</Button></div>
    </>}
    {saveNew.isError ? <p className="form-error" role="alert">Collection created, but the movie was not saved. {collectionError(saveNew.error, true)} Select the new collection to retry.</p> : <p className="collection-save-feedback" role="status">{feedback}</p>}
  </CollectionDialog>
}
