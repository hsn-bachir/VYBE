<?php

return [
    'expires_minutes' => max(1, (int) env('INVITATION_EXPIRES_MINUTES', 60)),
];
