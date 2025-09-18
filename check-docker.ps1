Write-Host "Checking Docker Desktop status..." -ForegroundColor Cyan

$dockerPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"

if (Test-Path $dockerPath) {
    Write-Host "Docker found at: $dockerPath" -ForegroundColor Green

    # Try to get Docker info
    try {
        $dockerInfo = & $dockerPath info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker is running!" -ForegroundColor Green
            Write-Host ""
            & $dockerPath version
        } else {
            Write-Host "Docker Desktop is installed but not running properly." -ForegroundColor Yellow
            Write-Host "Error: $dockerInfo" -ForegroundColor Red
            Write-Host ""
            Write-Host "Please ensure:" -ForegroundColor Cyan
            Write-Host "1. Docker Desktop is running (check system tray)" -ForegroundColor White
            Write-Host "2. Wait for Docker Desktop to fully start (green icon)" -ForegroundColor White
            Write-Host "3. If WSL2 error, run: wsl --update" -ForegroundColor White
        }
    } catch {
        Write-Host "Error connecting to Docker: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Docker not found at expected location" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "If Docker is running, you can start databases with:" -ForegroundColor Cyan
Write-Host "  .\start-databases.ps1" -ForegroundColor Green