import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import type { Collection } from '../types/collection.types'

export function CollectionCard({ collection, onEdit, onDelete }: { collection: Collection; onEdit: () => void; onDelete: () => void }) {
  return <li className="collection-card">
    <Link className="collection-card-link" to={`/library/collections/${collection.id}`} aria-label={`Open ${collection.name}, collection ${collection.id}`}>
      <span className="collection-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <rect x="8" y="8" width="32" height="32" rx="9" />
          <path d="M17 17h14M17 23h14M17 29h8" />
          <circle cx="31" cy="31" r="4" />
        </svg>
      </span>
      <span className="eyebrow">Private collection · {collection.id}</span>
      <h3>{collection.name}</h3><p className="collection-count">{collection.movie_count} {collection.movie_count === 1 ? 'movie' : 'movies'} <span aria-hidden="true">↗</span></p>
      {collection.description && <p className="collection-preview">{collection.description}</p>}
    </Link>
    <div className="collection-card-actions"><Button onClick={onEdit} aria-label={`Edit ${collection.name}, collection ${collection.id}`}>Edit</Button><Button onClick={onDelete} aria-label={`Delete ${collection.name}, collection ${collection.id}`}>Delete</Button></div>
  </li>
}
