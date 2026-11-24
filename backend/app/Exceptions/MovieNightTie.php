<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

class MovieNightTie extends HttpException
{
    public function __construct(private array $leaders)
    {
        parent::__construct(409, 'Choose one of the tied leaders.');
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'code' => 'MOVIE_NIGHT_TIE',
            'leaders' => $this->leaders], 409)->header('Cache-Control', 'no-store, private');
    }
}
