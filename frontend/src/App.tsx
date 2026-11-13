import { lazy, Suspense } from 'react'
import { Route, Routes, Link } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { GuestOnly, PublicOrVerified, RequireAuth, RequireAdmin, RequireUserManager } from './features/auth/guards/AuthGuards'
import { VerificationPage } from './features/auth/pages/VerificationPage'
import { PopularMoviesPage } from './features/movies/pages/PopularMoviesPage'
import { DiscoverPage } from './features/movies/pages/DiscoverPage'
import { MovieState } from './features/movies/components/MovieState'
import { VybeLoader } from './components/branding/VybeLoader'
import { MovieDetailsSkeleton } from './features/movies/components/MovieDetailsSkeleton'
const LibraryPage = lazy(() => import('./features/library/pages/LibraryPage'))
const ForYouPage = lazy(() => import('./features/recommendations/ForYouPage'))
const LibraryOverviewPage = lazy(() => import('./features/library/pages/LibraryOverviewPage'))
const FirebaseVerificationActionPage = lazy(() => import('./features/auth/pages/FirebaseVerificationActionPage').then(module => ({ default: module.FirebaseVerificationActionPage })))
const FirebaseEmailActionPage = lazy(() => import('./features/auth/pages/FirebaseEmailActionPage').then(module => ({ default: module.FirebaseEmailActionPage })))
const ForgotPasswordPage = lazy(() => import('./features/auth/pages/ForgotPasswordPage').then(module => ({ default: module.ForgotPasswordPage })))
const SocialUsernamePage = lazy(() => import('./features/auth/pages/SocialUsernamePage').then(module => ({ default: module.SocialUsernamePage })))
const ProviderConnectionsPage = lazy(() => import('./features/auth/pages/ProviderConnectionsPage').then(module => ({ default: module.ProviderConnectionsPage })))
const InvitationAcceptancePage = lazy(() => import('./features/auth/pages/InvitationAcceptancePage').then(module => ({ default: module.InvitationAcceptancePage })))
const PasswordResetPage = lazy(() => import('./features/auth/pages/PasswordResetPage').then(module => ({ default: module.PasswordResetPage })))
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage'))
const AdminPage = lazy(() => import('./features/admin/pages/AdminPage'))
const AdminUsersPage = lazy(() => import('./features/admin/pages/AdminUsersPage'))
const AdminUserDetailsPage = lazy(() => import('./features/admin/pages/AdminUserDetailsPage'))
const ReportsPage = lazy(() => import('./features/moderation/pages/ReportsPage'))
const ReportDetailsPage = lazy(() => import('./features/moderation/pages/ReportDetailsPage'))
const ModerationReviewsPage = lazy(() => import('./features/moderation/pages/ModerationReviewsPage'))
const ModerationActionsPage = lazy(() => import('./features/moderation/pages/ModerationActionsPage'))
const CollectionsPage = lazy(() => import('./features/collections/pages/CollectionsPage'))
const CollectionDetailsPage = lazy(() => import('./features/collections/pages/CollectionDetailsPage'))
const MovieDetailsPage = lazy(() => import('./features/movies/pages/MovieDetailsPage').then(module => ({ default: module.MovieDetailsPage })))

export default function App() {
  return <Routes>
    <Route element={<PublicOrVerified />}><Route element={<AppLayout />}>
      <Route index element={<PopularMoviesPage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/movies/:tmdbId" element={<Suspense fallback={<MovieDetailsSkeleton />}><MovieDetailsPage /></Suspense>} />
      <Route element={<RequireAuth />}>
        <Route path="/for-you" element={<Suspense fallback={<VybeLoader label="Finding your next story…" />}><ForYouPage /></Suspense>} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Suspense fallback={<VybeLoader label="Opening administration…" />}><AdminPage /></Suspense>} />
          <Route path="/admin/reports" element={<Suspense fallback={<VybeLoader label="Opening reports…" />}><ReportsPage /></Suspense>} />
          <Route path="/admin/reports/:id" element={<Suspense fallback={<VybeLoader label="Opening report…" />}><ReportDetailsPage /></Suspense>} />
          <Route path="/admin/reviews" element={<Suspense fallback={<VybeLoader label="Opening reviews…" />}><ModerationReviewsPage /></Suspense>} />
          <Route path="/admin/actions" element={<Suspense fallback={<VybeLoader label="Opening history…" />}><ModerationActionsPage /></Suspense>} />
          <Route element={<RequireUserManager />}>
            <Route path="/admin/users" element={<Suspense fallback={<VybeLoader label="Opening users…" />}><AdminUsersPage /></Suspense>} />
            <Route path="/admin/users/:id" element={<Suspense fallback={<VybeLoader label="Opening account…" />}><AdminUserDetailsPage /></Suspense>} />
          </Route>
        </Route>
        <Route path="/profile" element={<Suspense fallback={<VybeLoader label="Opening your profile…" />}><ProfilePage /></Suspense>} />
        {import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase' && <Route path="/account/connections" element={<Suspense fallback={<VybeLoader label="Opening account connections…" />}><ProviderConnectionsPage /></Suspense>} />}
        <Route path="/library" element={<Suspense fallback={<VybeLoader label="Opening your library…" />}><LibraryOverviewPage /></Suspense>} />
        <Route path="/library/watchlist" element={<Suspense fallback={<VybeLoader label="Opening your library…" />}><LibraryPage key="watchlist" kind="watchlist" /></Suspense>} />
        <Route path="/library/watched" element={<Suspense fallback={<VybeLoader label="Opening your library…" />}><LibraryPage key="watched" kind="watched" /></Suspense>} />
        <Route path="/library/collections" element={<Suspense fallback={<VybeLoader label="Opening collections…" />}><CollectionsPage /></Suspense>} />
        <Route path="/library/collections/:id" element={<Suspense fallback={<VybeLoader label="Opening collection…" />}><CollectionDetailsPage /></Suspense>} />
      </Route>
      <Route path="*" element={<MovieState title="This scene doesn’t exist."><Link to="/">Find your way back to the movies</Link></MovieState>} />
    </Route></Route>
    <Route element={<GuestOnly />}><Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase' && <Route path="/auth/social/username" element={<Suspense fallback={<VybeLoader label="Opening account setup…" />}><SocialUsernamePage /></Suspense>} />}
    </Route></Route>
    <Route element={<AuthLayout />}>
      <Route path="/invitation/accept" element={<Suspense fallback={<VybeLoader label="Opening invitation…" />}><InvitationAcceptancePage /></Suspense>} />
      <Route path="/password/reset" element={<Suspense fallback={<VybeLoader label="Opening password reset…" />}><PasswordResetPage /></Suspense>} />
      {import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase' && <Route path="/password/forgot" element={<Suspense fallback={<VybeLoader label="Opening password recovery…" />}><ForgotPasswordPage /></Suspense>} />}
      {import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase' && <Route path="/verify-email/action" element={<Suspense fallback={<VybeLoader label="Opening email verification…" />}><FirebaseVerificationActionPage /></Suspense>} />}
      {import.meta.env.VITE_AUTH_IDENTITY_PROVIDER === 'firebase' && <Route path="/auth/action" element={<Suspense fallback={<VybeLoader label="Opening email action…" />}><FirebaseEmailActionPage /></Suspense>} />}
      <Route path="/verify-email" element={<VerificationPage state="pending" />} />
      <Route path="/verify-email/success" element={<VerificationPage state="success" />} />
      <Route path="/verify-email/error" element={<VerificationPage state="error" />} />
    </Route>
  </Routes>
}
