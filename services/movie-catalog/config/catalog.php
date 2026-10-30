<?php

return [
    'internal_token' => env('CATALOG_INTERNAL_TOKEN'),
    'metadata_ttl_seconds' => (int) env('CATALOG_METADATA_TTL_SECONDS', 604800),
    'ranking_ttl_seconds' => (int) env('CATALOG_RANKING_TTL_SECONDS', 900),
    'tmdb_token' => env('TMDB_TOKEN'),
    'connect_timeout_seconds' => max(1, min(5, (int) env('TMDB_CONNECT_TIMEOUT_SECONDS', 2))),
    'request_timeout_seconds' => max(1, min(15, (int) env('TMDB_REQUEST_TIMEOUT_SECONDS', 5))),
    'refresh_cooldown_seconds' => max(1, (int) env('CATALOG_REFRESH_COOLDOWN_SECONDS', 30)),
];
