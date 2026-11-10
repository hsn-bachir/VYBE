<?php

namespace App\Services;

final readonly class FirebaseIdentity
{
    public function __construct(
        public string $uid,
        public string $email,
        public bool $emailVerified,
        public ?string $signInProvider = null,
    ) {}
}
