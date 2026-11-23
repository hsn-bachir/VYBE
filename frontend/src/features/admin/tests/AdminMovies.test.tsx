import { describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api/client'
import { managedMovie, managedMovies, refreshMovie } from '../api/adminMoviesApi'
import { managedMovieKeys } from '../hooks/useAdminMovies'

describe('movie management API', () => {
  it('forwards filters and cancellation and checks account after CSRF', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], meta: {} } })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { tmdb_id: 550 } } })
    try {
      const { signal } = new AbortController()
      const filters = { q: 'Local movie', status: 'stale', page: 2 }
      await managedMovies(filters, signal)
      expect(get).toHaveBeenCalledWith('/api/v1/admin/movies', { params: filters, signal })
      await managedMovie(550, signal)
      expect(get).toHaveBeenCalledWith('/api/v1/admin/movies/550', { signal })
      await expect(refreshMovie(550, () => false)).rejects.toThrow('account changed')
      expect(post).not.toHaveBeenCalled()
      await expect(refreshMovie(550, () => true)).resolves.toEqual({ tmdb_id: 550 })
      expect(post).toHaveBeenCalledWith('/api/v1/admin/movies/550/refresh')
      expect(managedMovieKeys.detail(4, 550)).not.toEqual(managedMovieKeys.detail(5, 550))
    } finally { get.mockRestore(); post.mockRestore() }
  })
})
