# Docker Desktop Installation Helper Script for Windows
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video Mixer Pro - Docker Setup Helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version 2>$null
    if ($dockerVersion) {
        Write-Host "Docker is already installed!" -ForegroundColor Green
        Write-Host "Version: $dockerVersion" -ForegroundColor Green
        $dockerInstalled = $true
    } else {
        $dockerInstalled = $false
    }
} catch {
    $dockerInstalled = $false
}

if (-not $dockerInstalled) {
    Write-Host "Docker is not installed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please install Docker Desktop:" -ForegroundColor Cyan
    Write-Host "1. Download from: https://www.docker.com/products/docker-desktop/" -ForegroundColor White
    Write-Host "2. Run the installer" -ForegroundColor White
    Write-Host "3. Restart your computer if prompted" -ForegroundColor White
    Write-Host "4. Start Docker Desktop" -ForegroundColor White
    Write-Host "5. Run this script again" -ForegroundColor White
    Write-Host ""

    # Try to open download page
    $openBrowser = Read-Host "Do you want to open the Docker download page? (Y/N)"
    if ($openBrowser -eq 'Y' -or $openBrowser -eq 'y') {
        Start-Process "https://www.docker.com/products/docker-desktop/"
    }

    Write-Host ""
    Write-Host "After installing Docker, run this script again or use:" -ForegroundColor Yellow
    Write-Host "  .\start-databases.ps1" -ForegroundColor Cyan
    exit
} else {
    Write-Host ""
    Write-Host "Starting Docker containers..." -ForegroundColor Cyan
}

# Check if docker-compose exists
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    Write-Host "Using docker-compose..." -ForegroundColor Green
    docker-compose up -d postgres redis
} else {
    Write-Host "docker-compose not found, using docker run commands..." -ForegroundColor Yellow

    # Start PostgreSQL
    Write-Host ""
    Write-Host "Starting PostgreSQL..." -ForegroundColor Cyan
    docker run -d `
        --name videomixpro-postgres `
        -e POSTGRES_PASSWORD=password `
        -e POSTGRES_DB=videomixpro `
        -e POSTGRES_USER=postgres `
        -p 5432:5432 `
        postgres:15

    # Start Redis
    Write-Host "Starting Redis..." -ForegroundColor Cyan
    docker run -d `
        --name videomixpro-redis `
        -p 6379:6379 `
        redis:7-alpine
}

Write-Host ""
Write-Host "Waiting for containers to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Check container status
Write-Host ""
Write-Host "Container Status:" -ForegroundColor Cyan
docker ps --filter "name=videomixpro" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: npm run db:migrate" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Open: http://localhost:3000/health" -ForegroundColor White