import { Route, Routes, Link } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { GuestOnly, PublicOrVerified } from './features/auth/guards/AuthGuards'
import { VerificationPage } from './features/auth/pages/VerificationPage'

export default function App() {
  return <Routes>
    <Route element={<PublicOrVerified />}><Route element={<AppLayout />}>
      <Route index element={<><p className="eyebrow">Welcome to VYBE</p><h1>A shared love<br />of cinema.</h1><p className="text-muted">Movie discovery is coming in Milestone 1.</p></>} />
      <Route path="*" element={<><h1>Page not found</h1><Link to="/">Back to home</Link></>} />
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
