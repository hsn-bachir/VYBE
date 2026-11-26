import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { movieImageUrl } from '../../movies/api/images'
import type { Collection } from '../types/collection.types'

export function CollectionCardSkeleton({ label = 'Loading collection' }: { label?: string }) {
  return <li className="collection-card" role="status" aria-label={label}><div className="collection-card-link" aria-hidden="true"><div className="collection-art" data-count="3">{[0, 1, 2].map(i => <span className="collection-art-poster skeleton" key={i} />)}</div><div className="skeleton-title skeleton" /><div className="skeleton-meta skeleton" /></div></li>
}

function CollectionPoster({ posterPath }: { posterPath: string | null }) {
  const [failed, setFailed] = useState<string | undefined>()
  const src = movieImageUrl(posterPath)
  return <span className="collection-art-poster">
    {src && failed !== src
      ? <img src={src} alt="" width="160" height="240" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      : <span className="collection-art-missing">◈</span>}
  </span>
}

type CardCollection = Pick<Collection, 'id' | 'name' | 'description' | 'movie_count' | 'preview_movies'> & Partial<Pick<Collection, 'system_key' | 'visibility'>>
export function CollectionCard({ collection, onEdit, onDelete, to, builtIn = false, publicView = false }: { collection: CardCollection; onEdit?: () => void; onDelete?: () => void; to?: string; builtIn?: boolean; publicView?: boolean }) {
  const preview = collection.preview_movies?.slice(0, 3) ?? []
  return <li className="collection-card">
    <Link className="collection-card-link" to={to ?? (publicView ? `/collections/${collection.id}` : `/library/collections/${collection.id}`)} aria-label={`Open ${collection.name}, ${collection.movie_count} movies`}>
      <span className={`collection-art ${preview.length ? 'has-posters' : ''}`} data-count={preview.length} aria-hidden="true">
        {preview.length ? preview.map(movie => <CollectionPoster key={movie.tmdb_id} posterPath={movie.poster_path} />)
          : <span className="collection-art-empty">◈</span>}
      </span>
      <span className="eyebrow">{builtIn || collection.system_key === 'favorites' ? 'Built-in collection' : publicView || collection.visibility === 'public' ? 'Public collection' : 'Private collection'}</span>
      <h3>{collection.name}</h3><p className="collection-count">{collection.movie_count} {collection.movie_count === 1 ? 'movie' : 'movies'} <span aria-hidden="true">↗</span></p>
      {collection.description && <p className="collection-preview">{collection.description}</p>}
    </Link>
    {!publicView && (onEdit || onDelete || collection.visibility === 'public' && !collection.system_key && !builtIn) && <div className="collection-card-actions">{onEdit && <Button className="compact" onClick={onEdit} aria-label={`Edit ${collection.name}, collection ${collection.id}`}>Edit</Button>}{onDelete && <Button className="compact destructive" onClick={onDelete} aria-label={`Delete ${collection.name}, collection ${collection.id}`}>Delete</Button>}{collection.visibility === 'public' && !collection.system_key && !builtIn && <Link className="button compact" to={`/collections/${collection.id}`}>Open public page</Link>}</div>}
  </li>
}
