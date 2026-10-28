import { Link, useLocation } from 'react-router-dom'

export function MoviePagination({ page, totalPages }: { page: number; totalPages: number }) {
  const location = useLocation()
  if (totalPages <= 1 && page === 1) return null
  const target = (next: number) => {
    const params = new URLSearchParams(location.search)
    if (next === 1) params.delete('page'); else params.set('page', String(next))
    return `${location.pathname}?${params}`
  }
  return <nav className="movie-pagination" aria-label="Movie pages">
    {page > 1 ? <Link className="button" to={target(page - 1)}>← Previous</Link> : <span className="button disabled" aria-disabled="true">← Previous</span>}
    <span aria-live="polite">Page <strong>{page}</strong>{totalPages > 0 && <> of {totalPages}</>}</span>
    {page < totalPages ? <Link className="button" to={target(page + 1)}>Next page →</Link> : <span className="button disabled" aria-disabled="true">Next page →</span>}
  </nav>
}
