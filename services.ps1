<#
.SYNOPSIS
    Manages CodeArena '26 Disaster Response platform services.
.DESCRIPTION
    Starts, stops, restarts, or checks the status of the Express backend (port 3001)
    and Vite frontend (port 5173).
.EXAMPLE
    .\services.ps1 start
    .\services.ps1 stop
    .\services.ps1 restart
    .\services.ps1 status
    .\services.ps1 start -ResetDemo
    .\services.ps1 start -Foreground
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status')]
    [string]$Action = 'start',

    [Parameter()]
    [switch]$Foreground,

    [Parameter()]
    [switch]$ResetDemo
)

$ErrorActionPreference = 'Continue'
$RootPath = $PSScriptRoot
$PidFile = Join-Path $RootPath ".services.pid"

function Get-PortProcessIds([int[]]$Ports) {
    $pids = @()
    foreach ($port in $Ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($c in $conns) {
                if ($c.OwningProcess -and $c.OwningProcess -gt 4) {
                    $pids += $c.OwningProcess
                }
            }
        }
    }
    return ($pids | Select-Object -Unique)
}

function Stop-AllServices {
    Write-Host "`n🛑 Stopping CodeArena '26 disaster response services..." -ForegroundColor Yellow
    
    # 1. Kill recorded PID if exists
    if (Test-Path $PidFile) {
        try {
            $savedPid = Get-Content $PidFile -ErrorAction SilentlyContinue
            if ($savedPid -and (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) {
                Stop-Process -Id $savedPid -Force -ErrorAction SilentlyContinue
            }
        } catch {}
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }

    # 2. Free ports 3001 and 5173
    $activePids = Get-PortProcessIds @(3001, 5173)
    if ($activePids -and $activePids.Count -gt 0) {
        foreach ($p in $activePids) {
            try {
                $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "  Closing process $($proc.ProcessName) (PID: $p)..." -ForegroundColor DarkGray
                    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                }
            } catch {}
        }
    }

    # Wait briefly for ports to release
    Start-Sleep -Milliseconds 800
    $remaining = Get-PortProcessIds @(3001, 5173)
    if ($remaining -and $remaining.Count -gt 0) {
        Write-Host "⚠️ Warning: Some processes still bound to ports 3001/5173: $($remaining -join ', ')" -ForegroundColor Red
    } else {
        Write-Host "✓ All services stopped cleanly. Ports 3001 and 5173 are free.`n" -ForegroundColor Green
    }
}

function Get-ServicesStatus {
    Write-Host "`n🔍 Checking CodeArena '26 Services Status..." -ForegroundColor Cyan
    
    # Backend Check
    $backendPids = Get-PortProcessIds @(3001)
    $backendHealth = $null
    if ($backendPids) {
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
            $backendHealth = $resp.database
        } catch {
            $backendHealth = "unresponsive"
        }
        Write-Host "  ● Backend Express API : RUNNING (PID: $($backendPids -join ', '), Database: $backendHealth)" -ForegroundColor Green
    } else {
        Write-Host "  ○ Backend Express API : STOPPED (Port 3001 free)" -ForegroundColor DarkGray
    }

    # Frontend Check
    $frontendPids = Get-PortProcessIds @(5173)
    if ($frontendPids) {
        Write-Host "  ● Frontend Vite UI    : RUNNING (PID: $($frontendPids -join ', '))" -ForegroundColor Green
    } else {
        Write-Host "  ○ Frontend Vite UI    : STOPPED (Port 5173 free)" -ForegroundColor DarkGray
    }

    if ($backendPids -and $frontendPids) {
        Write-Host "`n  🌐 Web UI  : http://127.0.0.1:5173" -ForegroundColor White
        Write-Host "  🔌 API     : http://127.0.0.1:3001/api/health" -ForegroundColor White
        Write-Host "  🔑 Accounts: server/generated/demo-accounts.json`n" -ForegroundColor DarkCyan
    } else {
        Write-Host "`n  💡 To start all services: .\services.ps1 start`n" -ForegroundColor DarkGray
    }
}

function Start-AllServices {
    Write-Host "`n🚀 Initializing CodeArena '26 Disaster Response Services..." -ForegroundColor Cyan

    # Ensure clean ports
    $stalePids = Get-PortProcessIds @(3001, 5173)
    if ($stalePids -and $stalePids.Count -gt 0) {
        Write-Host "  Cleaning up existing processes on ports 3001/5173..." -ForegroundColor DarkGray
        Stop-AllServices
    }

    # Reset demo database if requested
    if ($ResetDemo) {
        Write-Host "  Resetting demo database to pristine state..." -ForegroundColor Yellow
        & npm run demo:reset
    }

    if ($Foreground) {
        Write-Host "  Starting services in foreground (Ctrl+C to stop)...`n" -ForegroundColor Yellow
        Set-Location $RootPath
        & npm run dev
        return
    }

    # Launch in background window
    Write-Host "  Launching Vite client & Express backend in background window..." -ForegroundColor White
    $cmd = "cd '$RootPath'; npm run dev"
    $proc = Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "$cmd" -PassThru

    if ($proc) {
        $proc.Id | Out-File -FilePath $PidFile -Encoding ascii
    }

    # Poll for backend readiness (up to 15 seconds)
    Write-Host "  Waiting for API and Database connection..." -NoNewline -ForegroundColor DarkGray
    $ready = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline -ForegroundColor DarkGray
        try {
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -Method Get -TimeoutSec 1 -ErrorAction Stop
            if ($res.ready -eq $true -or $res.database.status -eq 'connected') {
                $ready = $true
                break
            }
        } catch {}
    }
    Write-Host ""

    if ($ready) {
        Write-Host "`n================================================================" -ForegroundColor Green
        Write-Host "  ✅ CODEARENA ’26 DISASTER RESPONSE PLATFORM IS LIVE!          " -ForegroundColor Green
        Write-Host "================================================================" -ForegroundColor Green
        Write-Host "  🌐 Frontend Web UI    : http://127.0.0.1:5173" -ForegroundColor White
        Write-Host "  🔌 Backend API Health : http://127.0.0.1:3001/api/health" -ForegroundColor White
        Write-Host "  🔑 Demo Credentials   : server/generated/demo-accounts.json" -ForegroundColor DarkCyan
        Write-Host "================================================================" -ForegroundColor Green
        Write-Host "  To view status : .\services.ps1 status" -ForegroundColor DarkGray
        Write-Host "  To stop        : .\services.ps1 stop (or .\stop-services.ps1)`n" -ForegroundColor DarkGray
    } else {
        Write-Host "`n⚠️ Services launched, but API took longer than 15s to respond." -ForegroundColor Yellow
        Write-Host "  Inspect the service terminal window or run .\services.ps1 status.`n" -ForegroundColor Yellow
    }
}

# Execute requested action
switch ($Action) {
    'start'   { Start-AllServices }
    'stop'    { Stop-AllServices }
    'restart' { Stop-AllServices; Start-Sleep -Seconds 1; Start-AllServices }
    'status'  { Get-ServicesStatus }
}
