import { Link } from 'react-router-dom'
import { FirebasePasswordResetPage } from './FirebasePasswordResetPage'
import { FirebaseVerificationActionPage } from './FirebaseVerificationActionPage'

export function FirebaseEmailActionPage() {
  const mode = new URLSearchParams(window.location.search).get('mode')
  if (mode === 'resetPassword') return <FirebasePasswordResetPage />
  if (mode === 'verifyEmail' || mode === 'recoverEmail') return <FirebaseVerificationActionPage />
  return <div className="auth-card verification-card">
    <h2>Link not valid</h2>
    <p className="text-muted">This email link is incomplete or unsupported.</p>
    <Link to="/login">Back to sign in</Link>
  </div>
}
