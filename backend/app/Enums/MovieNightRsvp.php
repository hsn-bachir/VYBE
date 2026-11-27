<?php

namespace App\Enums;

enum MovieNightRsvp: string
{
    case Pending = 'pending';
    case Accepted = 'accepted';
    case Declined = 'declined';
}
