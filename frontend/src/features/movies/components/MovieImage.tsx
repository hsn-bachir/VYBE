import { useState } from 'react'
import symbol from '../../../assets/symbol.svg'
import { movieImageUrl } from '../api/images'

export function MovieImage({ path, title, variant = 'card', eager = false }: {
  path: string | null; title: string; variant?: 'card' | 'poster' | 'backdrop'; eager?: boolean
}) {
  const [failed, setFailed] = useState<string | undefined>()
  const src = movieImageUrl(path, variant === 'backdrop' ? 'w1280' : variant === 'poster' ? 'w500' : 'w342')
  if (!src || failed === src) return variant === 'backdrop' ? null : <div className="poster-fallback" role="img" aria-label={`Poster unavailable for ${title}`}><img src={symbol} alt="" /><span>Poster unavailable</span></div>
  return <img className={`movie-image ${variant}`} src={src}
    srcSet={variant === 'card' ? `${movieImageUrl(path, 'w342')} 342w, ${movieImageUrl(path, 'w500')} 500w` : variant === 'backdrop' ? `${movieImageUrl(path, 'w780')} 780w, ${src} 1280w` : undefined}
    sizes={variant === 'card' ? '(max-width: 599px) 45vw, (max-width: 899px) 29vw, (max-width: 1199px) 21vw, 200px' : variant === 'backdrop' ? '100vw' : undefined}
    alt={variant === 'backdrop' ? '' : `${title} poster`} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(src)} />
}
