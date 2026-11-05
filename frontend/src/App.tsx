import { lazy, Suspense } from 'react'
import { Route, Routes, Link, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { GuestOnly, PublicOrVerified, RequireAuth, RequireAdmin, RequireUserManager } from './features/auth/guards/AuthGuards'
import { VerificationPage } from './features/auth/pages/VerificationPage'
import { PopularMoviesPage } from './features/movies/pages/PopularMoviesPage'
import { DiscoverPage } from './features/movies/pages/DiscoverPage'
import { MovieState } from './features/movies/components/MovieState'
const LibraryPage = lazy(() => import('./features/library/pages/LibraryPage'))
const InvitationAcceptancePage = lazy(() => import('./features/auth/pages/InvitationAcceptancePage').then(module => ({ default: module.InvitationAcceptancePage })))
const PasswordResetPage = lazy(() => import('./features/auth/pages/PasswordResetPage').then(module => ({ default: module.PasswordResetPage })))
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage'))
const AdminPage = lazy(() => import('./features/admin/pages/AdminPage'))
const AdminUsersPage = lazy(() => import('./features/admin/pages/AdminUsersPage'))
const AdminUserDetailsPage = lazy(() => import('./features/admin/pages/AdminUserDetailsPage'))
const CollectionsPage = lazy(() => import('./features/collections/pages/CollectionsPage'))
const CollectionDetailsPage = lazy(() => import('./features/collections/pages/CollectionDetailsPage'))
const MovieDetailsPage = lazy(() => import('./features/movies/pages/MovieDetailsPage').then(module => ({ default: module.MovieDetailsPage })))

export default function App() {
  return <Routes>
    <Route element={<PublicOrVerified />}><Route element={<AppLayout />}>
      <Route index element={<PopularMoviesPage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/movies/:tmdbId" element={<Suspense fallback={<p role="status">Setting the scene…</p>}><MovieDetailsPage /></Suspense>} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Suspense fallback={<p role="status">Opening administration…</p>}><AdminPage /></Suspense>} />
          <Route element={<RequireUserManager />}>
            <Route path="/admin/users" element={<Suspense fallback={<p role="status">Opening users…</p>}><AdminUsersPage /></Suspense>} />
            <Route path="/admin/users/:id" element={<Suspense fallback={<p role="status">Opening account…</p>}><AdminUserDetailsPage /></Suspense>} />
          </Route>
        </Route>
        <Route path="/profile" element={<Suspense fallback={<p role="status">Opening your profile…</p>}><ProfilePage /></Suspense>} />
        <Route path="/library" element={<Navigate to="/library/watchlist" replace />} />
        <Route path="/library/watchlist" element={<Suspense fallback={<p role="status">Opening your library…</p>}><LibraryPage key="watchlist" kind="watchlist" /></Suspense>} />
        <Route path="/library/watched" element={<Suspense fallback={<p role="status">Opening your library…</p>}><LibraryPage key="watched" kind="watched" /></Suspense>} />
        <Route path="/library/collections" element={<Suspense fallback={<p role="status">Opening collections…</p>}><CollectionsPage /></Suspense>} />
        <Route path="/library/collections/:id" element={<Suspense fallback={<p role="status">Opening collection…</p>}><CollectionDetailsPage /></Suspense>} />
      </Route>
      <Route path="*" element={<MovieState title="This scene doesn’t exist."><Link to="/">Find your way back to the movies</Link></MovieState>} />
    </Route></Route>
    <Route element={<GuestOnly />}><Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route></Route>
    <Route element={<AuthLayout />}>
      <Route path="/invitation/accept" element={<Suspense fallback={<p role="status">Opening invitation…</p>}><InvitationAcceptancePage /></Suspense>} />
      <Route path="/password/reset" element={<Suspense fallback={<p role="status">Opening password reset…</p>}><PasswordResetPage /></Suspense>} />
      <Route path="/verify-email" element={<VerificationPage state="pending" />} />
      <Route path="/verify-email/success" element={<VerificationPage state="success" />} />
      <Route path="/verify-email/error" element={<VerificationPage state="error" />} />
    </Route>
  </Routes>
}
