import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../auth/hooks/useAuth'
import { LibraryHeader } from '../../library/components/LibraryHeader'
import { useLibraryAccessError } from '../../library/hooks/useLibrary'
import { MoviePagination } from '../../movies/components/MoviePagination'
import { MovieState } from '../../movies/components/MovieState'
import { collectionError } from '../api/collectionsApi'
import { collectionsOptions } from '../hooks/useCollections'
import type { Collection } from '../types/collection.types'
import { CollectionCard, CollectionCardSkeleton } from '../components/CollectionCard'
import { CollectionEditor } from '../components/CollectionEditor'
import { DeleteCollectionDialog } from '../components/DeleteCollectionDialog'
import '../collections.css'

export default function CollectionsPage() {
  const auth = useAuth()
  const owner = auth.data?.email_verified_at ? auth.data.id : 0
  return <CollectionsContent key={owner} owner={owner} />
}

function CollectionsContent({ owner }: { owner: number }) {
  const location = useLocation()
  const [feedback, setFeedback] = useState<string>(location.state?.collectionFeedback ?? '')
  const [editor, setEditor] = useState<Collection | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Collection | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [params, setParams] = useSearchParams()
  const rawPage = params.get('page') ?? '1'
  const valid = /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 10000
  const page = valid ? Number(rawPage) : 1
  const result = useQuery({ ...collectionsOptions(owner, page), enabled: owner > 0 && valid })
  useLibraryAccessError(result.error, owner)
  return <section className="personal-library collections-page">
    <LibraryHeader />
    <div className="section-heading collection-section-heading"><div><h2 ref={heading} tabIndex={-1}>Your collections<span className="accent-period">.</span></h2><p>Organize the movies you love, your way.</p></div><Button className="primary" onClick={() => setEditor('new')}>＋ New collection</Button></div>
    {!valid ? <MovieState title="That page is out of frame."><Link to="/library/collections">Go to the first page</Link></MovieState>
      : result.isPending ? <ul className="collection-grid" aria-label="Loading collections">{[1, 2, 3].map(i => <CollectionCardSkeleton key={i} />)}</ul>
        : result.isError ? <MovieState title="Your collections are taking an intermission." retry={() => void result.refetch()}>{collectionError(result.error)}</MovieState>
          : <>
            {result.data.data.length === 0 ? <MovieState title={page > 1 ? 'No collections on this page.' : 'Make room for your favorites.'}>{page > 1 ? <Link to="/library/collections">Go to the first page</Link> : <>Group films by mood, genre, or the people you watch with. Every collection is private. <Button className="primary" onClick={() => setEditor('new')}>Create your first collection</Button></>}</MovieState>
              : <ul className="collection-grid">{result.data.data.map(c => <CollectionCard key={c.id} collection={c} onEdit={c.system_key ? undefined : () => setEditor(c)} onDelete={c.system_key ? undefined : () => setDeleting(c)} />)}</ul>}
            <MoviePagination page={page} totalPages={result.data.meta.total_pages} />
          </>}
    {editor && <CollectionEditor owner={owner} collection={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => { setFeedback(editor === 'new' ? 'Collection created.' : 'Collection updated.'); setEditor(null); if (editor === 'new') setParams({}) }} />}
    {deleting && <DeleteCollectionDialog owner={owner} collection={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
      setDeleting(null); setFeedback('Collection deleted. Your other library memberships are unchanged.'); heading.current?.focus({ preventScroll: true })
      if (result.data?.data.length === 1 && page > 1) setParams({ page: String(page - 1) })
    }} />}
    <div className="library-feedback" role="status">{feedback && <>{feedback}<button aria-label="Dismiss notification" onClick={() => setFeedback('')}>×</button></>}</div>
  </section>
}
