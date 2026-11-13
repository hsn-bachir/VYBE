export function SectionSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div className="section-skeleton" role="status" aria-label={label}><span className="sr-only">{label}</span><div className="section-skeleton-heading skeleton" aria-hidden="true" />{Array.from({ length: rows }, (_, i) => <div className="section-skeleton-line skeleton" key={i} aria-hidden="true" />)}</div>
}
