<?php

return [
    'url' => env('MOVIE_CATALOG_URL', 'http://localhost:8001'),
    'token' => env('MOVIE_CATALOG_TOKEN'),
    'connect_timeout' => max(1, min(5, (int) env('MOVIE_CATALOG_CONNECT_TIMEOUT_SECONDS', 2))),
    // Catalog may make two 5-second TMDB attempts. Core does not retry.
    'timeout' => max(1, min(40, (int) env('MOVIE_CATALOG_TIMEOUT_SECONDS', 12))),
];
