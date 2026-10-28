<?php

namespace App\Integrations\MovieCatalog;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class CatalogFailure extends RuntimeException
{
    public function __construct(private int $status = 503, private array $errors = [])
    {
        parent::__construct('Movie catalog request failed');
    }

    public function render(): JsonResponse
    {
        return match ($this->status) {
            404 => response()->json(['message' => 'Movie not found', 'code' => 'MOVIE_NOT_FOUND'], 404),
            422 => response()->json(['message' => 'The request is invalid.', 'errors' => $this->errors], 422),
            default => response()->json(['message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE'], 503),
        };
    }

    public function report(): bool
    {
        // No raw upstream body, request headers or credentials in exception logs.
        return true;
    }
}
