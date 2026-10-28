<?php

namespace App\Exceptions;

use RuntimeException;

class UpstreamUnavailable extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Movie service unavailable');
    }
}
