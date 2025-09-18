# Start Databases for Video Mixer Pro
Write-Host "Starting databases for Video Mixer Pro..." -ForegroundColor Cyan

# Check if Docker is running
$dockerRunning = docker info 2>$null

if (-not $dockerRunning) {
    Write-Host "Docker is not running. Please start Docker Desktop first!" -ForegroundColor Red
    exit 1
}

# Stop existing containers if any
Write-Host "Stopping any existing containers..." -ForegroundColor Yellow
docker stop videomixpro-postgres videomixpro-redis 2>$null | Out-Null
docker rm videomixpro-postgres videomixpro-redis 2>$null | Out-Null

# Start PostgreSQL
Write-Host "Starting PostgreSQL..." -ForegroundColor Green
docker run -d `
    --name videomixpro-postgres `
    -e POSTGRES_PASSWORD=password `
    -e POSTGRES_DB=videomixpro `
    -e POSTGRES_USER=postgres `
    -p 5432:5432 `
    postgres:15

# Start Redis
Write-Host "Starting Redis..." -ForegroundColor Green
docker run -d `
    --name videomixpro-redis `
    -p 6379:6379 `
    redis:7-alpine

# Wait for containers
Write-Host "Waiting for containers to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Show status
Write-Host ""
Write-Host "Database Status:" -ForegroundColor Cyan
docker ps --filter "name=videomixpro" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "✓ Databases are ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Connection details:" -ForegroundColor Cyan
Write-Host "PostgreSQL: postgresql://postgres:password@localhost:5432/videomixpro" -ForegroundColor White
Write-Host "Redis: redis://localhost:6379" -ForegroundColor White