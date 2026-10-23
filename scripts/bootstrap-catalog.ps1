# VYBE foundation helper. Run from any directory using:
# powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-catalog.ps1
# Copies only tracked-style source files, never local .env, dependencies or runtime DBs.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $root 'backend'
$target = Join-Path $root 'services\movie-catalog'

if (-not (Test-Path (Join-Path $source 'artisan'))) {
    throw 'Missing backend Laravel scaffold. Merge/setup Core first.'
}
if (-not (Test-Path (Join-Path $target 'AGENTS.md'))) {
    throw 'Extract the VYBE foundation archive first: Catalog overlay files not found.'
}
if (Test-Path (Join-Path $target 'artisan')) {
    throw 'Catalog Laravel scaffold already exists. Review changes manually instead of running this helper again.'
}

# Copy only Git-tracked backend files. Never inspect or copy untracked local
# secrets such as .env, Composer auth.json, runtime DBs or generated caches.
$trackedFiles = & git -C $root ls-files -- backend
if ($LASTEXITCODE -ne 0 -or -not $trackedFiles) {
    throw 'Could not enumerate tracked Laravel source from git.'
}
$copied = 0
foreach ($trackedPath in $trackedFiles) {
    if (-not $trackedPath.StartsWith('backend/')) { continue }
    $relative = $trackedPath.Substring('backend/'.Length)
    $from = Join-Path $source $relative
    $destination = Join-Path $target $relative
    if (-not (Test-Path -LiteralPath $from)) { continue }
    $directory = Split-Path $destination -Parent
    if (-not (Test-Path $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    if (-not (Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath $from -Destination $destination
        $copied++
    }
}

# Catalog explicitly owns no users model, user factory, or core-only tables.
@('app\Models\User.php',
  'database\factories\UserFactory.php',
  'database\migrations\0001_01_01_000000_create_users_table.php') | ForEach-Object {
    $path = Join-Path $target $_
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
}

# Laravel's default seeder references users; Catalog has no user seeder.
$seeder = Join-Path $target 'database\seeders\DatabaseSeeder.php'
$seederContent = @'
<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // No seed data: Catalog only persists real TMDB metadata.
    }
}
'@
[System.IO.File]::WriteAllText($seeder, $seederContent, (New-Object System.Text.UTF8Encoding($false)))

# Framework runtime directories are locally writable and ignored by nested Laravel rules.
@('storage\app\private', 'storage\app\public', 'storage\framework\cache\data',
  'storage\framework\sessions', 'storage\framework\testing',
  'storage\framework\views', 'storage\logs', 'bootstrap\cache') | ForEach-Object {
    New-Item -ItemType Directory -Path (Join-Path $target $_) -Force | Out-Null
}

Write-Host "Catalog scaffold copied ($copied missing files)." -ForegroundColor Green
Write-Host 'Next: cd services/movie-catalog; composer install; Copy-Item .env.example .env; php artisan key:generate'
Write-Host 'Set your own local database/token credentials; then migrate, run tests, and review git status.'
