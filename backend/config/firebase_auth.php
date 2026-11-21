<?php

return [
    'mode' => env('AUTH_IDENTITY_PROVIDER', 'legacy'),
    'project_id' => env('FIREBASE_PROJECT_ID'),
    'max_auth_age_seconds' => (int) env('FIREBASE_MAX_AUTH_AGE_SECONDS', 300),
    'emulator_host' => env('FIREBASE_AUTH_EMULATOR_HOST'),
];
