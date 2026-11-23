<?php

namespace App\Enums;

enum MovieNightStatus: string
{
    case Scheduled = 'scheduled';
    case Finalized = 'finalized';
    case Cancelled = 'cancelled';
}
