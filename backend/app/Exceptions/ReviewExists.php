<?php

namespace App\Exceptions;

use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\JsonResponse;
use RuntimeException;

class ReviewExists extends RuntimeException implements ShouldntReport
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'A review already exists for this movie.', 'code' => 'REVIEW_EXISTS'], 409);
    }
}
