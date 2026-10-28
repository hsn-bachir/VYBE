export function MovieRating({ rating, votes }: { rating: number | null; votes?: number | null }) {
  if (rating === null || votes === 0) return <span className="unrated">Not yet rated</span>
  return <span className="movie-rating" aria-label={`TMDB rating ${rating.toFixed(1)} out of 10`}><span aria-hidden="true">★</span> {rating.toFixed(1)}<span className="rating-source"> / 10</span></span>
}
