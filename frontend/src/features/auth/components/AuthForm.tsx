import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { errorDetails } from '../../../lib/api/client'
import { useAuthenticate } from '../hooks/useAuth'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const registering = mode === 'register'
  const mutation = useAuthenticate(mode)
  const navigate = useNavigate()
  const location = useLocation()
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const error = mutation.error ? errorDetails(mutation.error) : null
  const fields = { ...error?.fields, ...localErrors }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    mutation.reset()
    const data = new FormData(event.currentTarget)
    const values = { username: String(data.get('username') ?? '').trim().toLowerCase(), email: String(data.get('email') ?? '').trim(), password: String(data.get('password') ?? ''), password_confirmation: String(data.get('password_confirmation') ?? '') }
    if (registering && (!/^[a-z0-9_]{3,30}$/.test(values.username) || ['admin', 'support', 'system', 'root', 'vybe'].includes(values.username))) {
      setLocalErrors({ username: ['Use 3–30 letters, numbers, or underscores; this username may be reserved.'] })
      return
    }
    if (registering && values.password !== values.password_confirmation) {
      setLocalErrors({ password_confirmation: ['Passwords must match.'] })
      return
    }
    setLocalErrors({})
    try {
      const signedIn = await mutation.mutateAsync(registering ? values : { email: values.email, password: values.password })
      const from = location.state?.from
      navigate(!signedIn.email_verified_at ? '/verify-email' : typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !/^\/(login|register)/.test(from) ? from : '/', { replace: true })
    } catch { /* Persistent, accessible error shown below. */ }
  }

  return <div className="auth-card">
    <p className="eyebrow">{registering ? 'Your next chapter' : 'Good to see you again'}</p>
    <h2>{registering ? 'Create your account' : 'Welcome back'}</h2>
    <p className="text-muted">{registering ? 'Join VYBE with your email.' : 'Sign in to your VYBE account.'}</p>
    <form onSubmit={submit} aria-label={registering ? 'Registration' : 'Login'}>
      {error && <div className="form-error" role="alert">{error.message}</div>}
      {registering && <Input name="username" label="Username" autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" hint="3–30 letters, numbers, or underscores." error={fields.username?.[0]} disabled={mutation.isPending} />}
      <Input name="email" label="Email address" type="email" autoComplete="email" required maxLength={255} error={fields.email?.[0]} disabled={mutation.isPending} />
      <Input name="password" label="Password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : undefined} maxLength={255} hint={registering ? 'At least 12 characters, including a letter and a number.' : undefined} error={fields.password?.[0]} disabled={mutation.isPending} />
      {registering && <Input name="password_confirmation" label="Confirm password" type="password" autoComplete="new-password" required maxLength={255} error={fields.password_confirmation?.[0]} disabled={mutation.isPending} />}
      <Button type="submit" className="primary w-full" disabled={mutation.isPending}>{mutation.isPending ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</Button>
    </form>
    <div className="divider">More ways to connect</div>
    <div className="oauth-options">{['Google', 'GitHub'].map(provider => <Button key={provider} type="button" disabled>{provider}<span>Coming soon</span></Button>)}</div>
    <p className="auth-switch">{registering ? 'Already have an account?' : 'New to VYBE?'}{' '}<Link to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</Link></p>
  </div>
}
