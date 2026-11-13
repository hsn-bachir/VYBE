export const categories = [
  ['popular', 'Popular'], ['trending', 'Trending'], ['top_rated', 'Top Rated'], ['now_playing', 'Now Playing'], ['upcoming', 'Upcoming'],
] as const
export const sorts = [
  ['popularity.desc', 'Most popular'], ['vote_average.desc', 'Highest rated'], ['primary_release_date.asc', 'Release date: earliest'],
  ['primary_release_date.desc', 'Release date: latest'], ['title.asc', 'Title: A–Z'], ['title.desc', 'Title: Z–A'],
] as const
// TMDB's movie genre IDs are a small, stable vocabulary, not a metadata request per visit.
export const genres = [
  [28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [99, 'Documentary'], [18, 'Drama'],
  [10751, 'Family'], [14, 'Fantasy'], [36, 'History'], [27, 'Horror'], [10402, 'Music'], [9648, 'Mystery'],
  [10749, 'Romance'], [878, 'Science Fiction'], [10770, 'TV Movie'], [53, 'Thriller'], [10752, 'War'], [37, 'Western'],
] as const
export type Category = typeof categories[number][0]
export type Sort = typeof sorts[number][0]
export interface DiscoveryFilters {
  category?: Category; sort?: Sort; genres?: number[]; genre_match?: 'any' | 'all'
  year_from?: number; year_to?: number; rating_min?: number; runtime_min?: number; runtime_max?: number; original_language?: string
}
export const defaultSort = (category: Category) => category === 'top_rated' ? 'vote_average.desc' : 'popularity.desc'
export function normalizeDiscovery(filters: DiscoveryFilters): DiscoveryFilters {
  const category = filters.category ?? 'popular'
  const result: DiscoveryFilters = { category }
  if (category !== 'trending') result.sort = filters.sort ?? defaultSort(category)
  if (filters.genres?.length) {
    result.genres = [...new Set(filters.genres)].sort((a, b) => a - b)
    result.genre_match = filters.genre_match ?? 'any'
  }
  for (const key of ['year_from', 'year_to', 'runtime_min', 'runtime_max'] as const) {
    if (category === 'trending' && key.startsWith('runtime')) continue
    if (filters[key] !== undefined) result[key] = filters[key]
  }
  if (filters.rating_min) result.rating_min = filters.rating_min
  if (filters.original_language) result.original_language = filters.original_language
  return result
}
export function parseDiscovery(params: URLSearchParams) {
  const filters: DiscoveryFilters = {}
  const errors: string[] = []
  const category = params.get('category') ?? 'popular'
  if (!categories.some(([value]) => value === category)) errors.push('Choose a valid category.')
  else filters.category = category as Category
  const sort = params.get('sort')
  if (sort !== null) {
    if (!sorts.some(([value]) => value === sort)) errors.push('Choose a valid sort order.')
    else filters.sort = sort as Sort
  }
  const selected = params.get('genres')
  if (selected !== null) {
    const ids = selected.split(',')
    if (ids.length > 19 || ids.some(id => !/^\d+$/.test(id) || !genres.some(([value]) => value === Number(id)))) errors.push('Choose valid genres.')
    else filters.genres = ids.map(Number)
  }
  const match = params.get('genre_match')
  if (match !== null && match !== 'any' && match !== 'all') errors.push('Choose ANY or ALL genre matching.')
  else if (match) filters.genre_match = match
  for (const key of ['year_from', 'year_to', 'rating_min', 'runtime_min', 'runtime_max'] as const) {
    const raw = params.get(key)
    if (raw === null) continue
    const value = Number(raw)
    const max = key.startsWith('year') ? 2100 : key === 'rating_min' ? 10 : 600
    const min = key.startsWith('year') ? 1888 : 0
    if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(value) || value < min || value > max || (key !== 'rating_min' && !Number.isInteger(value))) errors.push(`Check ${key.replaceAll('_', ' ')}.`)
    else filters[key] = value
  }
  if ((filters.year_from ?? 1888) > (filters.year_to ?? 2100) || (filters.runtime_min ?? 0) > (filters.runtime_max ?? 600)) errors.push('The range minimum must not exceed its maximum.')
  const language = params.get('original_language')
  if (language !== null) {
    if (!/^[a-z]{2}$/.test(language)) errors.push('Use a two-letter original language code.')
    else filters.original_language = language
  }
  if (category === 'trending' && [...params.keys()].some(key => ['sort', 'runtime_min', 'runtime_max'].includes(key))) errors.push('Trending preserves provider order and has no runtime metadata.')
  return { filters: normalizeDiscovery(filters), errors }
}
export function discoveryParams(filters: DiscoveryFilters, page = 1) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(normalizeDiscovery(filters))) {
    params.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  if (page > 1) params.set('page', String(page))
  return params
}
