import { Button } from '../../../components/ui/Button'
import { collectionError } from '../api/collectionsApi'
import { useCollectionMutation } from '../hooks/useCollections'
import type { Collection } from '../types/collection.types'
import { CollectionDialog } from './CollectionDialog'

export function DeleteCollectionDialog({ owner, collection, onClose, onDeleted }: { owner: number; collection: Collection; onClose: () => void; onDeleted: () => void }) {
  const mutation = useCollectionMutation(owner, onDeleted)
  return <CollectionDialog title="Delete collection?" onClose={onClose} busy={mutation.isPending}>
    <p className="collection-dialog-copy">Permanently delete <strong>{collection.name}</strong> and its {collection.movie_count} movie memberships? The movies stay in VYBE. Your Watchlist, Watched and other collections are unaffected.</p>
    {mutation.isError && <p role="alert" className="form-error">{collectionError(mutation.error)}</p>}
    <div className="collection-dialog-actions"><Button autoFocus disabled={mutation.isPending} onClick={onClose}>Keep collection</Button><Button className="collection-danger" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: 'delete', id: collection.id })}>{mutation.isPending ? 'Deleting…' : 'Delete collection'}</Button></div>
  </CollectionDialog>
}
