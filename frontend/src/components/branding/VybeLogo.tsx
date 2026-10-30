import { Link } from 'react-router-dom'
import fullLogo from '../../assets/logo.svg'
import symbol from '../../assets/symbol.svg'

export function VybeLogo({ variant = 'full', className = '' }: { variant?: 'full' | 'symbol'; className?: string }) {
  return <Link to="/" className={`brand vybe-logo ${className}`} aria-label="VYBE home">
    <img src={variant === 'full' ? fullLogo : symbol} alt="" className={variant === 'full' ? 'vybe-logo-full' : 'vybe-logo-symbol'} />
  </Link>
}
