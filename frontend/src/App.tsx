import { lazy, Suspense } from 'react'
import { Route, Routes, Link, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { GuestOnly, PublicOrVerified, RequireAuth } from './features/auth/guards/AuthGuards'
import { VerificationPage } from './features/auth/pages/VerificationPage'
import { PopularMoviesPage } from './features/movies/pages/PopularMoviesPage'
import { DiscoverPage } from './features/movies/pages/DiscoverPage'
import { MovieState } from './features/movies/components/MovieState'
const LibraryPage = lazy(() => import('./features/library/pages/LibraryPage'))
const MovieDetailsPage = lazy(() => import('./features/movies/pages/MovieDetailsPage').then(module => ({ default: module.MovieDetailsPage })))

export default function App() {
  return <Routes>
    <Route element={<PublicOrVerified />}><Route element={<AppLayout />}>
      <Route index element={<PopularMoviesPage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/movies/:tmdbId" element={<Suspense fallback={<p role="status">Setting the scene…</p>}><MovieDetailsPage /></Suspense>} />
      <Route element={<RequireAuth />}>
        <Route path="/library" element={<Navigate to="/library/watchlist" replace />} />
        <Route path="/library/watchlist" element={<Suspense fallback={<p role="status">Opening your library…</p>}><LibraryPage key="watchlist" kind="watchlist" /></Suspense>} />
        <Route path="/library/watched" element={<Suspense fallback={<p role="status">Opening your library…</p>}><LibraryPage key="watched" kind="watched" /></Suspense>} />
      </Route>
      <Route path="*" element={<MovieState title="This scene doesn’t exist."><Link to="/">Find your way back to the movies</Link></MovieState>} />
    </Route></Route>
    <Route element={<GuestOnly />}><Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route></Route>
    <Route element={<AuthLayout />}>
      <Route path="/verify-email" element={<VerificationPage state="pending" />} />
      <Route path="/verify-email/success" element={<VerificationPage state="success" />} />
      <Route path="/verify-email/error" element={<VerificationPage state="error" />} />
    </Route>
  </Routes>
}
