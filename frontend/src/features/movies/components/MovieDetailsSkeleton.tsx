import '../details.css'

export function MovieDetailsSkeleton() {
  return <div className="detail-page-skeleton" role="status" aria-label="Loading movie details">
    <span className="sr-only">Loading movie details…</span>
    <div className="detail-skeleton-back skeleton" aria-hidden="true" />
    <div className="detail-skeleton-hero" aria-hidden="true">
      <div className="detail-skeleton-poster skeleton" />
      <div className="detail-skeleton-copy">
        <div className="detail-skeleton-eyebrow skeleton" />
        <div className="detail-skeleton-title skeleton" />
        <div className="detail-skeleton-title short skeleton" />
        <div className="detail-skeleton-meta skeleton" />
        <div className="detail-skeleton-genres"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
        <div className="detail-skeleton-actions skeleton" />
      </div>
    </div>
    <div className="detail-skeleton-story" aria-hidden="true"><div><div className="detail-skeleton-heading skeleton" /><div className="detail-skeleton-line skeleton" /><div className="detail-skeleton-line skeleton" /><div className="detail-skeleton-line short skeleton" /></div><div className="detail-skeleton-facts skeleton" /></div>
  </div>
}
