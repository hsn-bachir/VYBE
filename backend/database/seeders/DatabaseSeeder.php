<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // A local password account cannot sign in when Firebase owns identity.
        if (config('firebase_auth.mode') !== 'legacy') {
            return;
        }

        User::factory()->create([
            'username' => 'test_user',
            'email' => 'test@example.com',
        ]);
    }
}
