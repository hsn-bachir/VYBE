type ImageSize = 'w342' | 'w500' | 'w780' | 'w1280'
export function movieImageUrl(path: string | null, size: ImageSize = 'w342'): string | undefined {
  return path && /^\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : undefined
}
export const releaseYear = (date: string | null) => date?.slice(0, 4) || null
