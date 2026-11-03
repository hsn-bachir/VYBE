import { useId, useState } from 'react'
import { Dialog } from '../../../components/ui/Dialog'
import { Button } from '../../../components/ui/Button'
import { errorDetails } from '../../../lib/api/client'
import { profileError } from '../api/profileApi'
import type { ProfileValues } from '../types/profile.types'

export function ProfileEditor({ initial, pending, error, onSave, onClose }: { initial: ProfileValues; pending: boolean; error: unknown; onSave: (values: ProfileValues) => void; onClose: (values: ProfileValues) => void }) {
  const id = useId(), [username, setUsername] = useState(initial.username), [bio, setBio] = useState(initial.bio ?? ''), [submitted, setSubmitted] = useState(false)
  const normalized = username.trim().toLowerCase(), count = [...bio.trim()].length, fields = errorDetails(error).fields
  const nameError = submitted && !/^[a-z0-9_]{3,30}$/.test(normalized) ? 'Use 3–30 letters, numbers or underscores.' : fields.username?.[0]
  const bioError = count > 500 ? 'Keep your bio within 500 characters.' : fields.bio?.[0]
  const close = () => onClose({ username, bio })
  return <Dialog title="Edit profile" onClose={close} busy={pending} className="profile-dialog">
    <form className="profile-form" noValidate onSubmit={event => { event.preventDefault(); setSubmitted(true); if (!pending && /^[a-z0-9_]{3,30}$/.test(normalized) && count <= 500) onSave({ username: normalized, bio: bio.trim() || null }) }}>
      <div className="field"><label htmlFor={`${id}-username`}>Username</label><input id={`${id}-username`} autoFocus value={username} disabled={pending} autoComplete="username" onChange={event => setUsername(event.target.value)} aria-invalid={Boolean(nameError)} aria-describedby={`${id}-username-error`} /><p id={`${id}-username-error`} className="field-error">{nameError}</p></div>
      <div className="field"><label htmlFor={`${id}-bio`}>Biography</label><textarea id={`${id}-bio`} rows={4} value={bio} disabled={pending} onChange={event => setBio(event.target.value)} aria-invalid={Boolean(bioError)} aria-describedby={`${id}-bio-count ${id}-bio-error`} /><p id={`${id}-bio-count`} className="hint">{count.toLocaleString()} / 500 characters</p><p id={`${id}-bio-error`} className="field-error">{bioError}</p></div>
      {Boolean(error) && <p role="alert" className="form-error">{profileError(error)}</p>}
      <div className="profile-form-actions"><Button type="button" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" className="primary" disabled={pending || count > 500}>{pending ? 'Saving…' : 'Save changes'}</Button></div>
    </form>
  </Dialog>
}
