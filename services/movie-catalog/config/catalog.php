<?php

return [
    'internal_token' => env('CATALOG_INTERNAL_TOKEN'),
    'metadata_ttl_seconds' => (int) env('CATALOG_METADATA_TTL_SECONDS', 604800),
    'ranking_ttl_seconds' => (int) env('CATALOG_RANKING_TTL_SECONDS', 900),
    'tmdb_token' => env('TMDB_TOKEN'),
];
