import { Link, Outlet, useLocation } from 'react-router-dom'
import { VybeLogo } from '../components/branding/VybeLogo'

export function AuthLayout() {
  const verifying = useLocation().pathname.startsWith('/verify-email')
  return <main className="auth-layout">
    <section className="auth-intro">
      <VybeLogo />
      <div className="auth-intro-copy"><p className="eyebrow">A place for your love of cinema</p><h1>Every great story<br />starts somewhere.</h1><p className="text-muted">Make yourself at home.</p></div>
      {verifying ? <span className="text-muted">Your next chapter starts here.</span> : <Link to="/" className="text-muted">← Back to home</Link>}
    </section>
    <section className="auth-panel"><Outlet /></section>
  </main>
}
