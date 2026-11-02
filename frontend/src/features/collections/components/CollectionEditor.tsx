import { useIsMutating } from '@tanstack/react-query'
import { CollectionDialog } from './CollectionDialog'
import { CollectionForm } from './CollectionForm'
import type { Collection } from '../types/collection.types'

export function CollectionEditor({ owner, collection, onClose, onSaved }: { owner: number; collection?: Collection; onClose: () => void; onSaved: (collection: Collection) => void }) {
  const busy = useIsMutating({ mutationKey: ['library', owner, 'collection-write'] }) > 0
  return <CollectionDialog title={collection ? 'Edit collection' : 'Create collection'} onClose={onClose} busy={busy}>
    <CollectionForm owner={owner} collection={collection} onSaved={onSaved} onCancel={onClose} />
  </CollectionDialog>
}
