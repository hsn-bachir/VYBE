import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AnimatedContent from '../../components/react-bits/AnimatedContent'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../auth/hooks/useAuth'
import { useLibraryAccessError, useMembership } from '../library/hooks/useLibrary'
import { MovieCard } from '../movies/components/MovieCard'
import { MovieGridSkeleton } from '../movies/components/MovieGrid'
import { MovieState } from '../movies/components/MovieState'
import { movieError } from '../movies/api/moviesApi'
import { recommendationOptions } from './recommendations'
import './recommendations.css'

const SaveCollectionDialog = lazy(() => import('../collections/components/SaveCollectionDialog'))
function RecommendationActions({ owner, id, title }: { owner: number; id: number; title: string }) {
  const watched = useMembership(owner, 'watched', id)
  const watchlist = useMembership(owner, 'watchlist', id)
  const [save, setSave] = useState(false)
  return <div className="recommendation-actions">
    <Button className="compact ghost" aria-label={`Watchlist ${title}`} disabled={watchlist.isPending} onClick={() => watchlist.mutate(true)}>Watchlist +</Button>
    <Button className="compact ghost" aria-label={`Mark ${title} watched`} disabled={watched.isPending} onClick={() => watched.mutate(true)}>Watched ✓</Button>
    <Button className="compact ghost" aria-label={`Save ${title} to a collection`} onClick={() => setSave(true)}>Save +</Button>
    {(watched.isError || watchlist.isError) && <p role="alert">Could not save. Try again.</p>}
    {save && <Suspense fallback={<span role="status">Opening collections…</span>}><SaveCollectionDialog owner={owner} movie={id} title={title} onClose={() => setSave(false)} /></Suspense>}
  </div>
}
export default function ForYouPage() {
  const auth = useAuth()
  const owner = auth.data?.email_verified_at ? auth.data.id : 0
  const result = useQuery(recommendationOptions(owner))
  useLibraryAccessError(result.error, owner)
  return <div className="for-you-page">
    <AnimatedContent className="for-you-intro"><p className="eyebrow">Your next great story</p><h1>For You<span className="accent-period">.</span></h1><p>A little of what you love. A little you have yet to discover.</p><Link className="text-link" to="/library">Shape your picks in your library ↗</Link></AnimatedContent>
    {result.isPending ? <MovieGridSkeleton count={12} label="Finding your next films" /> : result.isError ? <MovieState title="Your next story is taking a moment." retry={() => void result.refetch()}>{movieError(result.error)}</MovieState>
      : <>{result.data.meta.partial && <p className="freshness-note" role="status">Some movie sources are unavailable. Here are the picks we could find. <button onClick={() => void result.refetch()}>Retry</button></p>}
        {result.data.data.sections.some(section => section.movies.length) ? result.data.data.sections.filter(section => section.movies.length).map(section => <section key={section.id} className="movie-section recommendation-section" aria-labelledby={`recommendation-${section.id}`}>
          <AnimatedContent className="section-heading"><div><p className="eyebrow">{section.id === 'top' ? (result.data.meta.personalized ? 'Picked for your taste' : 'Start exploring') : 'Follow your curiosity'}</p><h2 id={`recommendation-${section.id}`}>{section.title}<span className="accent-period">.</span></h2>{section.explanation && <p>{section.explanation}</p>}</div></AnimatedContent>
          <ul className="movie-grid">{section.movies.map(movie => <MovieCard key={movie.tmdb_id} movie={movie}><RecommendationActions owner={owner} id={movie.tmdb_id} title={movie.title} /></MovieCard>)}</ul>
        </section>) : <MovieState title="A new chapter is on its way.">No eligible films are available right now. <Link to="/discover">Explore Discover</Link> or try again later.</MovieState>}
      </>}
  </div>
}
