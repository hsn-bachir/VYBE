import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { categories, defaultSort, discoveryParams, genres, sorts, type DiscoveryFilters } from '../lib/discovery'

const languages = [['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['es', 'Spanish'], ['ja', 'Japanese'], ['ko', 'Korean'], ['hi', 'Hindi'], ['de', 'German'], ['it', 'Italian'], ['zh', 'Chinese']]

export function DiscoveryCategories({ filters }: { filters: DiscoveryFilters }) {
  const category = filters.category ?? 'popular'
  return <nav className="discovery-categories" aria-label="Browse categories">{categories.map(([value, label]) => <Link key={value} aria-current={category === value ? 'page' : undefined} to={`/discover?${discoveryParams({ ...filters, category: value, sort: value === 'trending' ? undefined : defaultSort(value), runtime_min: value === 'trending' ? undefined : filters.runtime_min, runtime_max: value === 'trending' ? undefined : filters.runtime_max })}`}>{label}</Link>)}</nav>
}

export function DiscoveryControls({ filters, params, onChange }: { filters: DiscoveryFilters; params: URLSearchParams; onChange: (params: URLSearchParams) => void }) {
  const category = filters.category ?? 'popular'
  const trending = category === 'trending'
  const active = Object.entries(filters).filter(([key]) => !['category', 'sort', 'genres', 'genre_match'].includes(key))
  const count = active.length + (filters.genres?.length ?? 0)
  const remove = (key: string, genre?: number) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (genre !== undefined) {
      const remaining = filters.genres?.filter(id => id !== genre) ?? []
      if (remaining.length) next.set('genres', remaining.join(','))
      else { next.delete('genres'); next.delete('genre_match') }
    } else next.delete(key)
    onChange(next)
  }
  return <div className="discovery-controls">
    <form key={params.toString()} className="discovery-filter-form" onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const next = new URLSearchParams({ category })
      if (!trending) next.set('sort', filters.sort ?? defaultSort(category))
      for (const [key, value] of data.entries()) if (key !== 'genres' && String(value).trim()) next.set(key, String(value).trim())
      const ids = data.getAll('genres').map(String)
      if (ids.length) next.set('genres', ids.join(',')); else next.delete('genre_match')
      onChange(next)
    }}>
      <div className="discovery-toolbar">
        <details className="discovery-filter-panel"><summary>Filters {count > 0 && <span className="filter-count">{count}</span>}</summary>
          <div className="discovery-filter-content">
            {trending && <p className="discovery-scope">Filters apply to the first 60 films in this week’s Trending selection. Ranking stays in TMDB order; runtime is unavailable.</p>}
            <div className="discovery-genre-header"><h3>Genres</h3><label>Match<select aria-label="Match genres" name="genre_match" defaultValue={filters.genre_match ?? 'any'}><option value="any">Any selected</option><option value="all">All selected</option></select></label></div>
            <fieldset className="discovery-genres"><legend className="sr-only">Genres</legend>{genres.map(([id, name]) => <label key={id}><input type="checkbox" name="genres" value={id} defaultChecked={filters.genres?.includes(id)} /><span>{name}</span></label>)}</fieldset>
            <div className="discovery-filter-groups"><fieldset><legend>Release</legend><div className="discovery-pair"><label>From year<input name="year_from" type="number" min="1888" max="2100" placeholder="Any" defaultValue={filters.year_from} /></label><label>To year<input name="year_to" type="number" min="1888" max="2100" placeholder="Any" defaultValue={filters.year_to} /></label></div></fieldset>
              <fieldset><legend>Movie details</legend><div className="discovery-detail-fields"><label>Minimum TMDB rating<input name="rating_min" type="number" min="0" max="10" step="0.1" placeholder="Any" defaultValue={filters.rating_min} /></label>{!trending && <><label>Runtime from<input name="runtime_min" type="number" min="0" max="600" placeholder="Any" defaultValue={filters.runtime_min} /></label><label>Runtime to<input name="runtime_max" type="number" min="0" max="600" placeholder="Any" defaultValue={filters.runtime_max} /></label></>}<label>Original language<select aria-label="Original language" name="original_language" defaultValue={filters.original_language ?? ''}><option value="">Any language</option>{languages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}{filters.original_language && !languages.some(([code]) => code === filters.original_language) && <option value={filters.original_language}>{filters.original_language.toUpperCase()}</option>}</select></label></div></fieldset>
            </div><div className="discovery-filter-actions"><Button type="submit">Show results</Button>{count > 0 && <Link className="text-link" to={`/discover?category=${category}`}>Clear all</Link>}</div>
          </div>
        </details>
        {!trending && <label className="discovery-sort">Sort <select aria-label="Sort by" value={filters.sort ?? defaultSort(category)} onChange={event => onChange(discoveryParams({ ...filters, sort: event.target.value as DiscoveryFilters['sort'] }))}>{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      </div>
    </form>
    {count > 0 && <div className="discovery-active" aria-label="Active filters">{filters.genres?.map(id => <button key={id} onClick={() => remove('genres', id)} aria-label={`Remove ${genres.find(([value]) => value === id)?.[1]} filter`}>{genres.find(([value]) => value === id)?.[1]} <span aria-hidden="true">×</span></button>)}{active.map(([key, value]) => <button key={key} onClick={() => remove(key)} aria-label={`Remove ${key.replaceAll('_', ' ')} filter`}>{key.replaceAll('_', ' ')}: {String(value)} <span aria-hidden="true">×</span></button>)}<Link className="text-link" to={`/discover?category=${category}`}>Clear all</Link></div>}
  </div>
}
