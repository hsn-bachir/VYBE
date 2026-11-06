import { useEffect, useId, useState } from 'react'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { errorDetails } from '../../../lib/api/client'
import { avatarFileError, profileError } from '../api/profileApi'

export function AvatarEditor({ username, url, pending, error, onUpload, onRemove }: { username: string; url: string | null; pending: boolean; error: unknown; onUpload: (file: File) => void; onRemove: () => void }) {
  const id = useId(), [selection, setSelection] = useState<{ file: File; preview: string } | null>(null), [invalid, setInvalid] = useState('')
  const file = selection?.file, preview = selection?.preview
  useEffect(() => () => { if (selection) URL.revokeObjectURL(selection.preview) }, [selection])
  return <section className="profile-avatar-editor" aria-labelledby={`${id}-title`} aria-busy={pending}>
    <div><h2 id={`${id}-title`}>Profile picture</h2><p>JPEG, PNG or WebP · up to 2 MiB · 2048 × 2048px</p></div>
    <div className="profile-avatar-controls"><Avatar username={username} url={url} />
      <div className="profile-avatar-input"><label htmlFor={`${id}-file`}>Choose an image</label><input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} aria-describedby={`${id}-error`} onChange={event => { const next = event.target.files?.[0]; if (!next) return; const message = avatarFileError(next); setInvalid(message ?? ''); setSelection(message ? null : { file: next, preview: URL.createObjectURL(next) }); event.target.value = '' }} /></div>
    </div>
    {preview && file && <div className="profile-avatar-preview"><img src={preview} alt="Selected avatar preview, not saved" /><div><p>Preview · not saved</p><div className="profile-form-actions"><Button disabled={pending} onClick={() => onUpload(file)}>{pending ? 'Uploading…' : 'Upload selected image'}</Button><Button disabled={pending} onClick={() => setSelection(null)}>Discard image</Button></div></div></div>}
    {(invalid || Boolean(error)) && <p id={`${id}-error`} role="alert" className="field-error">{invalid || errorDetails(error).fields.avatar?.[0] || profileError(error)}</p>}
    {url && <Button className="profile-remove-avatar" disabled={pending} onClick={onRemove}>Remove picture</Button>}
  </section>
}
