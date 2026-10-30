import { Route, Routes, Link } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { GuestOnly, PublicOrVerified } from './features/auth/guards/AuthGuards'
import { VerificationPage } from './features/auth/pages/VerificationPage'
import { PopularMoviesPage } from './features/movies/pages/PopularMoviesPage'
import { DiscoverPage } from './features/movies/pages/DiscoverPage'
import { MovieDetailsPage } from './features/movies/pages/MovieDetailsPage'
import { MovieState } from './features/movies/components/MovieState'

export default function App() {
  return <Routes>
    <Route element={<PublicOrVerified />}><Route element={<AppLayout />}>
      <Route index element={<PopularMoviesPage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/movies/:tmdbId" element={<MovieDetailsPage />} />
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
