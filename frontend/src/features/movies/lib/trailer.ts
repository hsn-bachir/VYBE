import type { MovieTrailer } from '../types/movie.types'

export function trailerEmbed(trailer: MovieTrailer | null): string | null {
  return trailer?.site === 'YouTube' && /^[A-Za-z0-9_-]{11}$/.test(trailer.key)
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0` : null
}
