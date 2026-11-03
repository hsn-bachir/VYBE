<?php

namespace App\Exceptions;

use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\JsonResponse;
use RuntimeException;

class AvatarUnavailable extends RuntimeException implements ShouldntReport
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'Avatar updates are temporarily unavailable. Please try again.', 'code' => 'AVATAR_UNAVAILABLE'], 503);
    }
}
