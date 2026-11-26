import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { publicProfileFailure, publicProfileId } from '../api/publicProfileApi'
import { publicProfileOptions } from '../hooks/usePublicProfile'
import '../profile.css'
import '../public-profile.css'
import { PublicProfileCollections } from '../../collections/components/PublicProfileCollections'

function publicProfileReturnPath(state: unknown): string {
  const from = state && typeof state === 'object' && 'publicProfileFrom' in state ? state.publicProfileFrom : null
  return typeof from === 'string' && !/[\r\n\\]/.test(from) && /^\/movies\/[1-9][0-9]*(?:[?#].*)?$/.test(from) ? from : '/discover'
}

function PublicIdentity({ id }: { id: number }) {
  const result = useQuery(publicProfileOptions(id))
  // Background failures may retain query data. Never render it after an authoritative error.
  if (result.isError) {
    const failure = publicProfileFailure(result.error)
    return <section className="public-profile-state" role="alert" aria-labelledby="public-profile-error">
      <p className="eyebrow">Public profile</p><h1 id="public-profile-error">{failure.title}</h1><p>{failure.message}</p>
      {failure.retry && <Button className="primary" onClick={() => void result.refetch()} disabled={result.isFetching}>{result.isFetching ? 'Trying again…' : 'Try again'}</Button>}
    </section>
  }
  if (result.isPending) return <div className="profile-identity public-profile-identity" role="status" aria-label="Loading public profile">
    <span className="sr-only">Loading public profile…</span><span className="profile-hero-avatar skeleton" aria-hidden="true" />
    <div className="profile-identity-copy" aria-hidden="true"><div className="public-profile-skeleton-label skeleton" /><div className="public-profile-skeleton-name skeleton" /></div>
  </div>
  const profile = result.data
  return <><section className="profile-identity public-profile-identity" aria-labelledby="public-profile-name" aria-busy={result.isFetching}>
    <Avatar username={profile.username} url={profile.avatar_url} className="profile-hero-avatar" />
    <div className="profile-identity-copy"><p className="eyebrow">VYBE member</p><h1 id="public-profile-name">@{profile.username}</h1><p className="public-profile-caption">For the love of cinema.</p></div>
  </section><PublicProfileCollections id={id} /></>
}

export default function PublicProfilePage() {
  const { id: rawId } = useParams()
  const id = publicProfileId(rawId)
  const location = useLocation()
  const back = publicProfileReturnPath(location.state)
  return <div className="public-profile-page">
    <Link className="public-profile-back text-link" to={back}>← {back === '/discover' ? 'Back to Discover' : 'Back to movie'}</Link>
    {id === null ? <section className="public-profile-state" role="alert"><p className="eyebrow">Public profile</p><h1>Invalid profile link</h1><p>Check the profile link and try another page.</p></section>
      : <PublicIdentity key={id} id={id} />}
  </div>
}
