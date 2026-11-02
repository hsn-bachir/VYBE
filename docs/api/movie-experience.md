# Movie experience — implemented in M2.1

Public Core: `GET /api/v1/movies/{tmdb_id}/experience` (guest-readable). Internal Catalog: `GET /api/internal/v1/movies/{tmdb_id}/experience`, with the existing service-token guard. IDs follow the existing canonical int32 validation. Errors: 422 invalid ID, 404 only on a genuine provider movie-not-found, 503 unavailable or invalid upstream response. Core validates the envelope and every returned field, strips unknown fields and never forwards secrets or upstream diagnostics.

This additive endpoint preserves the existing base movie-details DTO exactly. The browser requests it after base details resolve, so the usual detail fetch warms the media cache first. Extras can fail independently of movie details or personal actions.

```json
{"data":{"tmdb_id":550,"tagline":null,"trailer":{"name":"Fixture trailer","site":"YouTube","key":"official123","type":"Trailer","official":true},"directors":[{"tmdb_id":1,"name":"Fixture director"}],"cast":[{"tmdb_id":2,"name":"Fixture actor","character":"Role","profile_path":null}],"related":[]},"meta":{"stale":false}}
```

Example values are synthetic contract fixtures, not actual TMDB/video content. `tagline` and `trailer` may be null; all lists may be empty. Directors are bounded to four, cast to twelve in provider order, and related movies to six unique non-self, non-adult provider recommendations. Related items use the existing eight-field MovieSummary DTO. No custom recommendation algorithm or invented ranking is introduced.

Catalog appends `videos,credits,recommendations` to its existing TMDB detail request, with the existing `en-US` language, timeouts, maximum two attempts and Retry-After handling. It makes no per-cast, per-related-movie or separate video request. A cold old detail cache may require one appended request when extras are first requested. Raw provider payloads are not exposed or stored in new relational tables.

Trailer selection accepts only YouTube, `Trailer`/`Teaser`, a nonempty name and an eleven-character `[A-Za-z0-9_-]` key. Stable preference: official trailer, other trailer, official teaser, other teaser; provider order breaks ties. Unsupported sites, clips and unsafe keys are skipped. Missing media produces null; malformed appended list structures produce 503 rather than a fabricated empty success. Invalid individual people/related rows are skipped; image paths use the existing safe-relative-path rules. Names, character, tagline and list lengths are bounded.

Successful detail hydration opportunistically captures normalized extras. Extras use the existing Catalog cache (`catalog:experience:v1:{id}`), the configured detail freshness TTL (default seven days), and a 30-day retention ceiling for stale fallback. Refresh failure uses a 30-second cooldown and returns a stale cached snapshot if retained; otherwise 503. The detail and extras refresh share a nonblocking per-movie lock. Valid empty media lists are cached too. A genuine provider 404 is not masked by stale extras.

Related summaries are persisted before return, without overwriting known fields with null or advancing detail freshness. This maintains Catalog-reference validation for every related movie displayed by the SPA. A successful full experience fetch also hydrates the base movie. Invalid optional extras never invalidate a successful base detail response.

The browser creates a lazy-loaded native modal and a `youtube-nocookie.com/embed/{validated-key}` iframe only after explicit play. It never inserts a provider-supplied URL. No YouTube thumbnail, iframe, SDK or preconnect is requested before play. Close/Escape unmounts the iframe, stops playback and restores trigger focus; native dialog provides focus containment. A visible external YouTube link handles embed/region/provider restrictions. VYBE cannot infer every cross-origin playback failure. There is no heavy video-player dependency.

TMDB reference: [append-to-response](https://developer.themoviedb.org/docs/append-to-response). The existing Catalog owns all TMDB metadata access; the browser only uses approved image hosting and explicit YouTube playback.
