# Catalog batch summary contract

Status: Catalog endpoint and Core client implemented and verified locally on SQLite and MySQL 8.0.43, including a real HTTP Core → Catalog smoke check. See the [foundation report](../development/m2-foundation-report.md). Future public M2 features remain planned only.

`POST /api/internal/v1/movies/summaries`, JSON, `Accept: application/json`, existing `X-VYBE-Service-Token` header. Internal service endpoint only; no browser route, session, CSRF or user identity.

```json
{"tmdb_ids":[550,551,550,552]}
```

`tmdb_ids` must be a non-empty JSON list containing at most 50 values **before deduplication**. Each is a strict JSON integer 1–2147483647; reject strings, booleans, floats, nulls, nested arrays and object-shaped maps with 422. Deduplicate in first-occurrence order. Unknown top-level fields are ignored, matching existing Catalog request allowlisting.

Synthetic partial-result example:

```json
{"data":[{"tmdb_id":550,"title":"Fixture movie","poster_path":null,"backdrop_path":null,"overview":null,"release_date":"1999-10-15","tmdb_rating":8.4,"tmdb_vote_count":1000}],"meta":{"requested_count":3,"returned_count":1,"missing_tmdb_ids":[551,552]}}
```

`requested_count` counts unique IDs, `returned_count` counts summaries. Found and missing lists each follow request first-occurrence order. Their disjoint union equals requested IDs. No pagination. All missing is 200 with `data: []`, returned_count 0 and every distinct requested ID in missing_tmdb_ids. A miss means absent from local Catalog persistence, not TMDB not-found. Reuse the existing eight-field MovieSummaryResource; no local PK, metadata timestamps, provider payload or secrets. Dates are YYYY-MM-DD/null, ratings numbers/null, vote counts integers/null.

One indexed `WHERE IN` movie query; reorder in memory, no N+1. Return fresh, stale and summary-only rows without mutating them, changing metadata_fetched_at, refreshing rankings, calling TMDB or starting jobs. Detail freshness does not measure summary freshness, so no invented per-summary stale flag. Endpoint is a read operation expressed as POST for a bounded body; repeating requests has no write side effects. No client-facing Catalog throttle is added.

| Failure | HTTP / body |
| --- | --- |
| Invalid body | 422 `{"message":"...","errors":{"tmdb_ids":["..."]}}` or indexed `tmdb_ids.0` errors |
| Missing/wrong token | 403 `{"message":"Forbidden.","code":"FORBIDDEN"}` |
| Missing server token configuration | 503 `{"message":"Service authentication is not configured.","code":"SERVICE_MISCONFIGURED"}` |
| Unexpected DB/server error | 500 `{"message":"Internal server error","code":"INTERNAL_ERROR"}` |

Auth runs before validation; no partial success for malformed requests. Valid cache misses never become 404. Existing discovery/detail response contracts are unchanged.

## Core consumer

Core exposes `App\Integrations\MovieCatalog\MovieCatalogClient::summaries(array $tmdbIds): array` on its existing client. Strict list of 0–50 integer IDs; invalid or oversized local input raises `InvalidArgumentException` before HTTP, including >50 duplicate entries. Empty input returns empty data and zero counts locally. Non-empty input deduplicates and sends one JSON POST. No chunking; future library page size <=50.

Use `movie_catalog` URL/token and timeout settings; redirects disabled, no automatic retry (matching existing Core client). Defaults: 2-second connect / 12-second request. No incoming cookies/Authorization forwarded. Validate envelope, counts, DTOs and complete disjoint coverage of requested IDs; reject duplicates, foreign IDs, unexplained omissions and malformed responses. Strip unknown fields and restore caller order defensively.

All upstream failures, including 403/404/422/429/5xx, malformed JSON/DTOs and connection errors, become existing safe `CatalogFailure` (503 UPSTREAM_UNAVAILABLE rendering). Local validation already succeeded, so internal 422 is a protocol/configuration failure rather than public caller validation. Do not expose upstream messages, credentials or exception chains. Missing IDs in a successful batch are ordinary data.

M2.1 will compose Core relationships with this result and preserve unavailable metadata placeholders; no public library integration exists in M2.0. No new env keys, migrations, dependencies or production data setup are required. Deploy Catalog support before a Core consumer starts using the operation. Operational limitations: cache coverage/freshness, shared service-token scope, bounded page size, and no live-provider or distributed deployment guarantee from local fake tests.
