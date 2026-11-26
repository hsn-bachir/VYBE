import { Link } from 'react-router-dom'
import { MovieState } from '../../movies/components/MovieState'
import '../movie-nights.css'

export default function MovieNightPlaceholderPage({ kind }: { kind: 'new' | 'detail' }) {
  return <section className="movie-nights-page night-placeholder">
    <p className="eyebrow">Movie nights</p><h1>{kind === 'new' ? 'Your next movie night.' : 'Movie night details.'}</h1>
    <MovieState title={kind === 'new' ? 'More good nights ahead.' : 'The full picture is coming soon.'}>
      {kind === 'new' ? 'Event creation will be available here soon.' : 'This space will bring your movie night together.'}
    </MovieState>
    <Link className="button secondary" to="/movie-nights">← Back to Movie Nights</Link>
  </section>
}
