param(
    [ValidateSet('core', 'catalog')][string]$Service = 'core',
    [int]$Port = 0
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$servicePath = if ($Service -eq 'core') { Join-Path $repoRoot 'backend' } else { Join-Path $repoRoot 'services/movie-catalog' }
if ($Port -eq 0) { $Port = if ($Service -eq 'core') { 8000 } else { 8001 } }
Push-Location (Join-Path $servicePath 'public')
try {
    # The Windows PHP development server otherwise recompiles Laravel on every request.
    # Check source timestamps on each request so edits are still reflected immediately.
    & php -d opcache.enable_cli=1 -d opcache.validate_timestamps=1 -d opcache.revalidate_freq=0 -S "localhost:$Port" '../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'
} finally { Pop-Location }
