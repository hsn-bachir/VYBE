import type { RatingStatistics } from '../types/rating.types'

export function RatingHistogram({ statistics }: { statistics: RatingStatistics }) {
  return <div className="rating-distribution"><h3>Rating distribution</h3><ul aria-label="VYBE rating distribution">
    {(['5', '4', '3', '2', '1'] as const).map(star => {
      const count = statistics.distribution[star]
      const percentage = statistics.total_ratings ? Math.round(count / statistics.total_ratings * 100) : 0
      return <li key={star} aria-label={`${star} stars: ${count} ${count === 1 ? 'rating' : 'ratings'} (${percentage}%)`}>
        <span className="rating-level" aria-hidden="true">{star} <span>★</span></span>
        <span className="rating-track" aria-hidden="true"><span style={{ width: `${percentage}%` }} /></span>
        <span className="rating-bucket-count" aria-hidden="true">{count.toLocaleString()} <small>({percentage}%)</small></span>
      </li>
    })}
  </ul></div>
}
