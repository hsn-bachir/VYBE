import { useId, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { collectionError } from '../api/collectionsApi'
import { useCollectionMutation } from '../hooks/useCollections'
import type { Collection } from '../types/collection.types'

export function CollectionForm({ owner, collection, onSaved, onCancel, createAndSave = false }: {
  owner: number; collection?: Collection; onSaved: (collection: Collection) => void; onCancel: () => void; createAndSave?: boolean
}) {
  const id = useId()
  const [name, setName] = useState(collection?.name ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')
  const [invalid, setInvalid] = useState(false)
  const mutation = useCollectionMutation(owner, result => { if (result) onSaved(result) })
  const fields = mutation.isError ? errorDetails(mutation.error).fields : {}
  return <form className="collection-form" noValidate aria-busy={mutation.isPending} onSubmit={event => {
    event.preventDefault()
    if (mutation.isPending) return
    setInvalid(true)
    if (!name.trim() || [...name.trim()].length > 100 || [...description].length > 2000) return
    const values = { name: name.trim(), description: description.trim() || null }
    mutation.mutate(collection ? { action: 'edit', id: collection.id, values } : { action: 'create', values })
  }}>
    <Input id={`${id}-name`} label="Collection name" value={name} autoFocus maxLength={100} disabled={mutation.isPending}
      onChange={event => setName(event.target.value)} error={invalid && !name.trim() ? 'Enter a collection name.' : fields.name?.[0]}
      hint="Up to 100 characters. Names can be reused." />
    <div className="field"><label htmlFor={`${id}-description`}>Description <span className="hint">(optional)</span></label>
      <textarea id={`${id}-description`} rows={4} maxLength={2000} value={description} disabled={mutation.isPending}
        onChange={event => setDescription(event.target.value)} aria-invalid={Boolean(fields.description)} aria-describedby={`${id}-description-help`} />
      <p id={`${id}-description-help`} className={fields.description ? 'field-error' : 'hint'}>{fields.description?.[0] ?? `${description.length} / 2000`}</p>
    </div>
    {mutation.isError && <p className="form-error" role="alert">{collectionError(mutation.error)}</p>}
    <div className="collection-dialog-actions"><Button type="button" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button><Button className="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : collection ? 'Save changes' : createAndSave ? 'Create & save movie' : 'Create collection'}</Button></div>
  </form>
}
