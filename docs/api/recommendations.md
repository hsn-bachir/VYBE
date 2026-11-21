# For You recommendations (M3.3)

Core owns deterministic preferences, scoring, exclusions and sections. Catalog owns provider queries and movie metadata. No new service, dependency, database table or public movie DTO is introduced.

## Public Core contract

`GET /api/v1/me/recommendations` uses the existing Sanctum session, account-access and verified-email middleware, library-read throttle, and `Cache-Control: no-store, private`. Browser CSRF/session recovery remains unchanged. Unauthenticated requests return 401; verification or account-access failures return 403; throttling returns 429; unavailable Catalog returns the existing safe 503 envelope. A restricted account retains existing permitted read access.

```json
{
  "data": {
    "sections": [{
      "id": "top",
      "title": "Top Picks for You",
      "explanation": "Selected from your movie interests.",
      "movies": []
    }]
  },
  "meta": { "personalized": true, "partial": false }
}
```

Movies use the existing summary DTO. Section IDs are `top`, `loved`, `watchlist`, `genre`, `actor`, `creators`. Top contains up to 18 movies, others up to 6. Unsupported/empty sections are omitted. All IDs are deduplicated within a section. Other sections prefer unused results when at least three relevant alternatives exist, otherwise allow repetition to retain relevance. The single creator section uses actual writer/director credits. Cold start uses “Worth discovering” and an explicit popularity/quality description. No raw preferences, reference lists or numerical scores leave Core.

## Internal Catalog contract

`POST /api/internal/v1/movies/recommendation-candidates` requires the existing `X-VYBE-Service-Token`. Invalid/missing token returns 403. Validation failures return 422. Provider failure without usable candidates returns 503; successfully exhausted empty sources return an empty list. Partial source failure returns available candidates with `meta.partial=true`.

Two bounded uses of this one endpoint:

- `{ "reference_ids": [550] }`: at most 50 IDs; one indexed movie query and one batch cache read, **zero provider calls**.
- `{ "sources": [{"kind":"genre","id":18}], "exclude_ids": [550] }`: at most six sources (`genre`, `actor`, `writer`, `director`, `similar`) plus a quality fallback. Exclusion hints are limited to 500 IDs and only guide refill. Core applies the complete authoritative exclusion set independently.

Response: `{data: Feature[], meta: {partial: boolean}}`, at most 200 features. A feature contains `movie` (unchanged summary), `genres`, `actors`, `writers`, `directors` (bounded `{id,name}` lists of at most 20/12/8/4), and `sources` (up to eight `{kind,id}` records, including `quality`). Optional missing metadata uses empty lists. Core validates the response and deduplicates by movie ID.

Genre/actor discovery uses provider genre/cast filters. Writer/director generation uses the crew filter, which **does not establish an actual role**: creator sections still require cached matching role credits. Similarity uses the provider movie recommendations endpoint. See the [official TMDB Discover contract](https://developer.themoviedb.org/reference/discover-movie) for the filter semantics.

Catalog receives no user ID and stores no user profile. It caches only canonical provider pages and movie metadata, shared across users. Request bodies and private preference details are not logged.

## Exact preference calculation

Core reads owner-scoped ratings, watchlist, watched and collection memberships using existing indexed keys; it never reads Catalog's DB. Each movie contributes one capped signal:

| Action | Weight |
| --- | ---: |
| Rating 5 | 1 |
| Rating 4 | .75 |
| Rating 3 | 0 |
| Rating 2 | -.6 |
| Rating 1 | -1 |
| Favorite, absent negative/neutral rating | .9 |
| Watchlist, absent stronger feedback | .2 |
| Watched, absent stronger feedback | .05 |
| Ordinary collection alone | 0 |

Explicit neutral/negative ratings override implicit actions. Positive overlap takes the maximum, never the sum. References are limited to the 50 strongest absolute signals, ties by movie ID. Each genre/contributor strength is `clamp(sum(movie weights)/2, -1, 1)`. Positive declared preferences require two distinct movies with weight >=.6. Weak watchlist/watched signals can influence a supported genre but cannot establish contributor preferences; contributor calculation ignores absolute weights below .6. Negative evidence can reduce/cancel positive strengths. Missing metadata creates no preference. Loved references require weight >=.75; positive watchlist references remain separate.

## Exact score and diversity

`Score = .40G + .25C + .20P + .15Q`, each in [0,1]. Unavailable components are omitted and remaining weights renormalized. A missing contributor list is unavailable, not dislike. A known feature with no matching preference contributes zero.

- G: nonnegative mean of signed genre strengths for matched IDs. Unmatched genres do not add weight. Genre count cannot multiply the score.
- C: mean of available actor/writer/director matches, each calculated like G; contributor count cannot multiply the score.
- P: 1 for a provider recommendation from a loved reference; .4 for a watchlist reference; maximum when both apply. With reference signals but no matching source, P=0; with no reference signals, unavailable.
- Q: `.8 * ((votes*rating + 300*6)/(votes+300)/10) + .2*min(1, log(1+votes)/log(10001))`. Missing votes use 0, missing rating uses 6. Bayesian shrinkage toward 6/10 and vote confidence reduce the influence of tiny samples. This is a quality/confidence proxy; raw provider popularity is not required in the public DTO.

Scores sort descending, ties by movie ID. A bounded greedy rerank subtracts `.04` for each already selected occurrence of the first genre, actor and director (total penalty capped at .24). Original scores remain unchanged. This promotes variety without excluding otherwise eligible films. No overlap bonus is applied; a future evaluated bonus belongs between scoring and diversification.

## Request and cache bounds

- At most eight provider pages, ordinarily ~100–160 raw candidates, hard output cap 200. One page per source, with a second quality page only when fewer than 100 eligible IDs remain. Stop exhausted sources and never loop to fill a section.
- Eight-second scheduling deadline: no new provider call begins after it. An in-flight provider call retains existing bounded timeout/retry behavior (at most two attempts/page, maximum 16 HTTP attempts). Core allows 25 seconds for the candidate operation; the browser allows 30 seconds for FYP only. Deadline/cap may return fewer candidates.
- Provider page cache keys sort canonical query keys; use existing ranking TTL. Summary genres are captured in batch without marking full detail metadata fresh. Credits are read in a single cache batch and never hydrated per candidate.
- Existing experience capture additionally caches at most eight writers using `Writer`, `Screenplay`, `Story`, `Characters` roles. Producers/other crew are excluded. Existing experience/public movie DTOs remain unchanged. Old experience cache can supply cast/directors until it refreshes; writer coverage grows only on subsequent detail capture.
- Preferences and ranked pools are private keys containing user ID plus SHA-256 of authoritative ratings and memberships. Default TTL 120 seconds; optional `RECOMMENDATIONS_TTL_SECONDS` clamps to 10–900. Every mutation changes the content revision automatically, including deletes and bulk membership removal. No fragile observer-only invalidation or queue dependency.
- Old revision entries expire naturally. Concurrent computations cannot overwrite another revision. Core rereads **all current exclusions after ranking/cache retrieval**. Watched, watchlisted, favorited, custom-saved and rated films are excluded from every section. The final read establishes the response's membership snapshot.
- React Query uses private owner-scoped library keys, removed by existing logout/account-access handling. Confirmed library/collection/rating mutations cancel the feed request, remove newly excluded IDs from every cached section, then invalidate in the background. Other users' feeds and Home/Discover queries are untouched.

## Operational limitations

No migration or additional credentials are required. Use existing independently configured Core/Catalog cache stores and the existing service token. Core never calls TMDB; Catalog never accesses Core's database. No movie table scan occurs: candidates come from bounded pages and metadata is fetched by indexed IDs. Activity reads scale with the user's own history, not the global movie library; very large personal histories still require full exclusion ID reads and revision hashing.

Contributor coverage depends on cached experience metadata. Sparse users may have only Top Picks/similarity sections. Creator sections are omitted when real role evidence is absent. References rotate daily among eligible alternatives. A narrow or exhausted pool may repeat relevant films across sections or return fewer results. Cold-start quality is a deterministic heuristic, not learned ML.

Provider pages have no indefinite stale-ranking fallback. Fresh cached pages/rankings remain usable within their TTL; partial source failure may retain usable candidates. After expiry, a complete outage produces a finite retry state, rather than fabricated or cross-user fallback results. Live TMDB latency, real catalog coverage, large-library load and relevance evaluation remain release acceptance work. No ML, vector database, collaborative filtering, background precomputation, additional service or speculative overlap bonus is included.
