<?php

namespace App\Exceptions;

use RuntimeException;

class MovieNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Movie not found');
    }
}
