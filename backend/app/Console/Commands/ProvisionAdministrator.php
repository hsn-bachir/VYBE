<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ProvisionAdministrator extends Command
{
    protected $signature = 'app:provision-admin {user_id : Existing verified user ID}';
    protected $description = 'Promote one existing verified, active account to initial administrator';

    public function handle(): int
    {
        $id = filter_var($this->argument('user_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (! $id) {
            $this->error('Supply a positive user ID.');
            return self::FAILURE;
        }

        return DB::transaction(function () use ($id): int {
            // Serialize concurrent provisioning attempts on the same database.
            $users = User::query()->orderBy('id')->lockForUpdate()->get();
            $target = $users->firstWhere('id', $id);
            if (! $target || ! $target->hasVerifiedEmail() || $target->account_status !== User::STATUS_ACTIVE) {
                $this->error('A verified, active account with that ID is required.');
                return self::FAILURE;
            }
            if ($users->contains(fn (User $user) => $user->role === User::ROLE_ADMIN && $user->id !== $target->id)) {
                $this->error('An administrator already exists.');
                return self::FAILURE;
            }
            if ($target->role === User::ROLE_ADMIN) {
                $this->info('This account is already the administrator.');
                return self::SUCCESS;
            }
            $target->role = User::ROLE_ADMIN;
            $target->save();
            $this->info('Administrator provisioned.');
            return self::SUCCESS;
        }, 3);
    }
}
