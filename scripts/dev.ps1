param(
  [switch]$SkipMigrations,
  [switch]$SkipDocker
)

$PORT = 3000
$SERVICE_NAME = "wallet-engine"

function Write-Info  { Write-Host "[*] $($args[0])" -ForegroundColor Cyan }
function Write-Ok   { Write-Host "[+] $($args[0])" -ForegroundColor Green }
function Write-Warn { Write-Host "[!] $($args[0])" -ForegroundColor Yellow }
function Write-Err  { Write-Host "[x] $($args[0])" -ForegroundColor Red }

function Stop-ProcessOnPort {
  param([int]$Port)

  $process = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }

  if (-not $process) {
    Write-Info "No process on port $Port — clean start"
    return
  }

  Write-Info "Process $($process.Name) (PID $($process.Id)) is on port $Port, shutting down gracefully..."

  try {
    Stop-Process -Id $process.Id -ErrorAction Stop
    $waitResult = $null
    $waitResult = Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
  } catch {
    Write-Warn "Graceful shutdown timed out, forcing kill..."
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 1
  Write-Ok "Port $Port is free"
}

function Start-DockerMySQL {
  Write-Info "Starting MySQL via docker compose..."
  $composeFile = Join-Path $PSScriptRoot "..\docker-compose.yml"

  docker compose -f $composeFile up -d wallet-mysql 2>&1 | Out-Null

  Write-Info "Waiting for MySQL to be healthy..."
  $healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    $status = docker compose -f $composeFile ps wallet-mysql --format json 2>$null |
      ConvertFrom-Json |
      Select-Object -ExpandProperty Health
    if ($status -eq "healthy") { $healthy = $true; break }
    Start-Sleep -Seconds 2
  }

  if (-not $healthy) {
    Write-Err "MySQL failed to become healthy within 60s"
    exit 1
  }
  Write-Ok "MySQL is healthy"
}

function Run-Migrations {
  Write-Info "Running database migrations..."
  Push-Location (Join-Path $PSScriptRoot "..")
  try {
    npm run migrate 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
    Write-Ok "Migrations complete"
  } finally {
    Pop-Location
  }
}

# --- Main ---
Write-Host "==============================================" -ForegroundColor Magenta
Write-Host "  $SERVICE_NAME — Dev Environment" -ForegroundColor Magenta
Write-Host "==============================================" -ForegroundColor Magenta
Write-Host ""

Stop-ProcessOnPort -Port $PORT

if (-not $SkipDocker) {
  Start-DockerMySQL
}

if (-not $SkipMigrations) {
  Run-Migrations
}

Write-Info "Starting dev server..."
Write-Host ""

Push-Location (Join-Path $PSScriptRoot "..")
try {
  npm run dev
  if ($LASTEXITCODE -ne 0) { throw "Dev server exited with code $LASTEXITCODE" }
} finally {
  Write-Info "Dev server stopped"
  Pop-Location
}
