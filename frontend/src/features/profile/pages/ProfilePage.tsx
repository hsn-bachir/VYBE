import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { profileError } from '../api/profileApi'
import { profileOptions, useProfileAccess, useProfileMutation } from '../hooks/useProfile'
import { ProfileEditor } from '../components/ProfileEditor'
import { AvatarEditor } from '../components/AvatarEditor'
import type { ProfileValues } from '../types/profile.types'
import '../profile.css'

function ProfileExperience({ owner }: { owner: number }) {
  const result = useQuery(profileOptions(owner)), [editing, setEditing] = useState(false), [feedback, setFeedback] = useState(''), [avatarRevision, setAvatarRevision] = useState(0)
  const [draft, setDraft] = useState<ProfileValues | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  useProfileAccess(result.error, owner)
  const mutation = useProfileMutation(owner, operation => { setFeedback(operation.action === 'edit' ? 'Your profile was updated.' : operation.action === 'upload' ? 'Your profile picture was updated.' : 'Your profile picture was removed.'); if (operation.action === 'edit') { setDraft(null); setEditing(false); requestAnimationFrame(() => editButton.current?.focus()) } else setAvatarRevision(value => value + 1) })
  if (result.isPending) return <div role="status" className="profile-loading">Opening your profile…<div className="skeleton" /></div>
  if (!result.data) return <div className="profile-error" role="alert"><h1>Your profile couldn’t load.</h1><p>{profileError(result.error)}</p><Button onClick={() => void result.refetch()}>Retry profile</Button></div>
  const profile = result.data, user = profile.user, date = profile.member_since ? new Date(profile.member_since) : null
  const member = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Date unavailable'
  return <div className="profile-page">
    <p className="eyebrow">Your corner of VYBE</p>
    <section className="profile-identity" aria-labelledby="profile-name"><Avatar username={user.username} url={user.avatar_url} className="profile-hero-avatar" /><div className="profile-identity-copy"><p className="profile-member">Member since {member}</p><h1 id="profile-name">@{user.username}</h1><p className={`profile-bio ${profile.bio ? '' : 'is-empty'}`}>{profile.bio || 'Every film leaves a mark. Tell your story here.'}</p></div><Button ref={editButton} className="primary" disabled={mutation.isPending} onClick={() => { mutation.reset(); setFeedback(''); setEditing(true) }}>Edit profile</Button></section>
    <p role="status" className="profile-feedback">{feedback || (result.isFetching ? 'Refreshing your activity…' : '')}</p>
    {result.isError && <p role="alert">Your latest profile couldn’t be refreshed. <Button onClick={() => void result.refetch()}>Retry profile</Button></p>}
    <section className="profile-journey" aria-labelledby="profile-journey"><div className="profile-section-heading"><div><p className="eyebrow">Your movie journey</p><h2 id="profile-journey">A life in films<span className="accent-period">.</span></h2></div><Link to="/discover">Find your next film ↗</Link></div><div className="profile-statistics"><Link className="profile-stat" to="/library/watched"><span>{profile.statistics.watched_count.toLocaleString()}</span><span>Movies watched <span aria-hidden="true">↗</span></span></Link><Link className="profile-stat" to="/library/watchlist"><span>{profile.statistics.watchlist_count.toLocaleString()}</span><span>On your watchlist <span aria-hidden="true">↗</span></span></Link><div className="profile-stat"><span>{profile.statistics.review_count.toLocaleString()}</span><span>Reviews written</span></div></div></section>
    <div className="profile-details-grid"><AvatarEditor key={avatarRevision} username={user.username} url={user.avatar_url} pending={mutation.isPending} error={mutation.variables?.action !== 'edit' && mutation.isError ? mutation.error : null} onUpload={file => { setFeedback(''); mutation.reset(); mutation.mutate({ action: 'upload', file }) }} onRemove={() => { setFeedback(''); mutation.reset(); mutation.mutate({ action: 'remove' }) }} /><section className="profile-account" aria-labelledby="profile-account"><h2 id="profile-account">Account details</h2><dl><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Email status</dt><dd>{user.email_verified_at ? 'Verified' : 'Not verified'}</dd></div><div><dt>Member since</dt><dd>{member}</dd></div></dl><p>Only you can see these account details.</p></section></div>
    <section className="profile-library" aria-labelledby="profile-library"><div><h2 id="profile-library">Your personal library</h2><p>Keep your next watch and all-time favorites in one place.</p></div><nav aria-label="Personal library"><Link to="/library/watchlist">Watchlist ↗</Link><Link to="/library/watched">Watched ↗</Link><Link to="/library/collections">Collections ↗</Link></nav></section>
    {editing && <ProfileEditor initial={draft ?? { username: user.username, bio: profile.bio }} pending={mutation.isPending} error={mutation.isError ? mutation.error : null} onSave={values => mutation.mutate({ action: 'edit', values })} onClose={values => { setDraft(values); setFeedback('Draft kept. Your profile hasn’t changed.'); setEditing(false); mutation.reset() }} />}
  </div>
}
export default function ProfilePage() { const auth = useAuth(); const owner = auth.data?.email_verified_at ? auth.data.id : 0; return owner ? <ProfileExperience key={owner} owner={owner} /> : <p role="status">Checking profile access…</p> }
