import type { ReactNode } from 'react'

type Variant = 'success' | 'error' | 'warning' | 'info'
const symbols: Record<Variant, string> = { success: '✓', error: '!', warning: '!', info: 'i' }

export function Alert({ children, variant = 'info', className = '' }: { children: ReactNode; variant?: Variant; className?: string }) {
  return <div className={`alert alert-${variant} ${className}`} role={variant === 'error' ? 'alert' : 'status'}>
    <span className="alert-icon" aria-hidden="true">{symbols[variant]}</span><div>{children}</div>
  </div>
}
