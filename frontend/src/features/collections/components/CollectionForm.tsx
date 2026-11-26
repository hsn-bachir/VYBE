import { useId, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { errorDetails } from '../../../lib/api/client'
import { collectionError } from '../api/collectionsApi'
import { useCollectionMutation } from '../hooks/useCollections'
import type { Collection } from '../types/collection.types'
import { useAccess } from '../../auth/hooks/useAccess'

export function CollectionForm({ owner, collection, onSaved, onCancel, createAndSave = false }: {
  owner: number; collection?: Collection; onSaved: (collection: Collection) => void; onCancel: () => void; createAndSave?: boolean
}) {
  const id = useId()
  const [name, setName] = useState(collection?.name ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')
  const [invalid, setInvalid] = useState(false)
  const [visibility, setVisibility] = useState<'private' | 'public'>(collection?.visibility ?? 'private')
  const access = useAccess(owner, true)
  const canPublish = !access.isError && access.data?.account_status === 'active'
  const withdrawalOnly = collection?.visibility === 'public' && !canPublish
  const mutation = useCollectionMutation(owner, result => { if (result) onSaved(result) })
  const fields = mutation.isError ? errorDetails(mutation.error).fields : {}
  if (collection?.system_key) return <div className="collection-dialog-copy"><p>Favorites is always private and cannot be edited.</p><Button onClick={onCancel}>Close</Button></div>
  if (withdrawalOnly) return <div className="collection-form"><p>Public collection edits require active account access. You can make this collection private first, then edit it privately.</p>
    {mutation.isError && <p role="alert">{collectionError(mutation.error)}</p>}
    <div className="collection-dialog-actions"><Button onClick={onCancel} disabled={mutation.isPending}>Cancel</Button><Button className="primary" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: 'edit', id: collection.id, values: { visibility: 'private' } })}>{mutation.isPending ? 'Withdrawing…' : 'Make private'}</Button></div></div>
  return <form className="collection-form" noValidate aria-busy={mutation.isPending} onSubmit={event => {
    event.preventDefault()
    if (mutation.isPending) return
    setInvalid(true)
    if (!name.trim() || [...name.trim()].length > 100 || [...description].length > 2000) return
    const values = { name: name.trim(), description: description.trim() || null, visibility }
    if (visibility === 'public' && !canPublish) return
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
    <div className="field"><label htmlFor={`${id}-visibility`}>Visibility</label>
      <select id={`${id}-visibility`} value={visibility} disabled={mutation.isPending} onChange={event => setVisibility(event.target.value as 'private' | 'public')} aria-describedby={`${id}-visibility-help`} aria-invalid={Boolean(fields.visibility)}>
        <option value="private">Private — only you</option><option value="public" disabled={!canPublish}>Public — anyone with the link</option>
      </select><p id={`${id}-visibility-help`} className={fields.visibility ? 'field-error' : 'hint'}>{fields.visibility?.[0] ?? (visibility === 'public' ? 'Anyone can see this collection and its movies, including visitors who are signed out. It appears on your public profile.' : 'Only you can view this collection. Publishing requires an active account.')}</p>
    </div>
    {mutation.isError && <p className="form-error" role="alert">{collectionError(mutation.error)}</p>}
    <div className="collection-dialog-actions"><Button type="button" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button><Button className="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : collection ? 'Save changes' : createAndSave ? 'Create & save movie' : 'Create collection'}</Button></div>
  </form>
}
