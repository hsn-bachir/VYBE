<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CatalogBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_owns_movies_table_but_not_users_table(): void
    {
        $this->assertTrue(Schema::hasTable('movies'));
        $this->assertFalse(Schema::hasTable('users'));
    }

    public function test_internal_endpoint_rejects_missing_or_invalid_token(): void
    {
        config()->set('catalog.internal_token', 'expected-test-secret');

        $this->getJson('/api/internal/v1/health')->assertForbidden();
        $this->withHeader('X-VYBE-Service-Token', 'invalid')
            ->getJson('/api/internal/v1/health')->assertForbidden();
    }

    public function test_internal_endpoint_accepts_valid_service_token(): void
    {
        config()->set('catalog.internal_token', 'expected-test-secret');

        $this->withHeader('X-VYBE-Service-Token', 'expected-test-secret')
            ->getJson('/api/internal/v1/health')
            ->assertOk()
            ->assertJsonPath('service', 'movie-catalog');
    }

    public function test_unconfigured_token_fails_closed(): void
    {
        config()->set('catalog.internal_token', null);

        $this->getJson('/api/internal/v1/health')
            ->assertStatus(503)
            ->assertJsonPath('code', 'SERVICE_MISCONFIGURED');
    }
}
