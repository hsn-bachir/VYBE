<?php

namespace App\Services;

use Kreait\Firebase\Auth\UserRecord;

class FirebaseIdentityMethods
{
    /** @return list<string> */
    public function forRecord(UserRecord $record): array
    {
        $methods = [];

        // providerData describes linked federated identities. A password is
        // established by credential metadata, not a providerData entry.
        if ($record->metadata->passwordUpdatedAt !== null || $record->passwordHash !== null) {
            $methods[] = 'password';
        }

        foreach ($record->providerData as $provider) {
            if (in_array($provider->providerId, ['google.com', 'github.com'], true)
                && ! in_array($provider->providerId, $methods, true)) {
                $methods[] = $provider->providerId;
            }
        }

        return $methods;
    }

    public function hasPassword(UserRecord $record): bool
    {
        return in_array('password', $this->forRecord($record), true);
    }
}
