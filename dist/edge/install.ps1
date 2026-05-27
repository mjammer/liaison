param(
    [Parameter(Mandatory = $true)]
    [string]$AccessKey,

    [Parameter(Mandatory = $true)]
    [string]$SecretKey,

    [Parameter(Mandatory = $true)]
    [string]$ServerHttpAddr,

    [Parameter(Mandatory = $true)]
    [string]$ServerEdgeAddr,

    [switch]$Force,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
    Write-Host "Usage: install.ps1 -AccessKey xxx -SecretKey yyy -ServerHttpAddr host -ServerEdgeAddr host:port [-Force]"
    Write-Host ""
    Write-Host "  -Force    Force reinstall even if an existing installation is detected"
    exit 0
}

if ($Help) {
    Show-Help
}

Write-Host "Starting Liaison Edge installation..." -ForegroundColor Green
Write-Host "OS: windows-amd64" -ForegroundColor Green

# ---------------- Paths ----------------
$InstallDir = "C:\Program Files\Liaison"
$BinDir     = Join-Path $InstallDir "bin"
$ConfDir    = Join-Path $InstallDir "conf"
$LogDir     = Join-Path $InstallDir "logs"

$BinaryName = "liaison-edge.exe"

# ---------------- Existing install guard ----------------
function Test-ExistingInstall {
    $hints = @()

    $binPath = Join-Path $BinDir $BinaryName
    if (Test-Path $binPath) {
        $hints += "  Binary: $binPath"
    }

    $cfgPath = Join-Path $ConfDir "liaison-edge.yaml"
    if (Test-Path $cfgPath) {
        $hints += "  Config: $cfgPath"
    }

    $task = Get-ScheduledTask -TaskName "LiaisonEdge" -ErrorAction SilentlyContinue
    if ($null -ne $task) {
        $hints += "  Scheduled Task: LiaisonEdge"
    }

    $runKey = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "LiaisonEdge" -ErrorAction SilentlyContinue
    if ($null -ne $runKey) {
        $hints += "  Registry Run Key: HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run\LiaisonEdge"
    }

    if ($hints.Count -eq 0) {
        return
    }

    if ($Force) {
        Write-Host "Existing Liaison Edge installation detected. Force mode enabled, continuing..." -ForegroundColor Yellow
        $hints | ForEach-Object {
            Write-Host $_ -ForegroundColor Yellow
        }
        return
    }

    Write-Host "ERROR: Existing Liaison Edge connector detected on this machine." -ForegroundColor Red
    Write-Host ""
    $hints | ForEach-Object {
        Write-Host $_ -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Please uninstall it first:" -ForegroundColor Green

    $uninstallCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://liaison.cloud/uninstall.ps1 -OutFile $env:TEMP\uninstall.ps1; & $env:TEMP\uninstall.ps1"'
    Write-Host "    $uninstallCmd" -ForegroundColor Green
    Write-Host ""
    Write-Host "Or retry with -Force if you are sure you want to reinstall." -ForegroundColor Yellow

    exit 1
}

Test-ExistingInstall

# ---------------- Temp ----------------
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "liaison-edge-install"

if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

# ---------------- Download ----------------
$PackageName = "liaison-edge-windows-amd64.tar.gz"
$PackageUrl  = "https://$ServerHttpAddr/packages/edge/$PackageName"
$PackagePath = Join-Path $TempDir $PackageName

Write-Host "Downloading package..." -ForegroundColor Yellow
Write-Host "URL: $PackageUrl" -ForegroundColor Yellow

# Force TLS 1.2 for old Windows environments
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$downloaded = $false

# Prefer curl.exe when available
if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    try {
        curl.exe -f -L $PackageUrl -o $PackagePath

        if (Test-Path $PackagePath) {
            if ((Get-Item $PackagePath).Length -gt 0) {
                $downloaded = $true
            }
        }
    } catch {
        $downloaded = $false
    }
}

# Fallback to Invoke-WebRequest
if (-not $downloaded) {
    try {
        Invoke-WebRequest -Uri $PackageUrl -OutFile $PackagePath -UseBasicParsing

        if (Test-Path $PackagePath) {
            if ((Get-Item $PackagePath).Length -gt 0) {
                $downloaded = $true
            }
        }
    } catch {
        Write-Host "ERROR: package download failed." -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $PackagePath)) {
    Write-Host "ERROR: download failed. Package file does not exist." -ForegroundColor Red
    exit 1
}

if ((Get-Item $PackagePath).Length -le 0) {
    Write-Host "ERROR: downloaded file is empty." -ForegroundColor Red
    exit 1
}

Write-Host "Download OK" -ForegroundColor Green

# ---------------- Extract ----------------
Write-Host "Extracting..." -ForegroundColor Yellow

if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: tar not found. Windows 10 1803+ or Git for Windows is required." -ForegroundColor Red
    exit 1
}

Push-Location $TempDir

try {
    tar -xzf $PackageName
} finally {
    Pop-Location
}

$BinaryPath = Join-Path $TempDir $BinaryName

if (-not (Test-Path $BinaryPath)) {
    Write-Host "ERROR: binary not found after extract." -ForegroundColor Red
    exit 1
}

# ---------------- Install ----------------
Write-Host "Installing..." -ForegroundColor Yellow

New-Item -ItemType Directory -Force -Path $BinDir, $ConfDir, $LogDir | Out-Null
Copy-Item $BinaryPath (Join-Path $BinDir $BinaryName) -Force

# ---------------- Config ----------------
$ConfigFile = Join-Path $ConfDir "liaison-edge.yaml"

# Convert Windows path to YAML-friendly forward-slash path.
# [char]92 is backslash.
# [char]47 is forward slash.
$LogFilePath = (Join-Path $LogDir "liaison-edge.log").Replace([char]92, [char]47)

$configLines = @(
    "manager:",
    "  dial:",
    "    addrs:",
    "      - $ServerEdgeAddr",
    "    network: tcp",
    "    tls:",
    "      enable: true",
    "      insecure_skip_verify: true",
    "  auth:",
    "    access_key: `"$AccessKey`"",
    "    secret_key: `"$SecretKey`"",
    "log:",
    "  level: info",
    "  file: $LogFilePath",
    "  maxsize: 100",
    "  maxrolls: 10"
)

$configLines -join "`n" | Set-Content -Path $ConfigFile -Encoding UTF8

Write-Host "Config written: $ConfigFile" -ForegroundColor Green

# ---------------- Register as scheduled task ----------------
Write-Host "Registering autostart task..." -ForegroundColor Yellow

$TaskName = "LiaisonEdge"
$ExePath  = Join-Path $BinDir $BinaryName
$ConfigArg = "-c `"$ConfigFile`""

# Stop and remove any existing task first
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $ExePath -Argument $ConfigArg
$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

$settings.DisallowStartIfOnBatteries = $false
$settings.StopIfGoingOnBatteries = $false

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "Autostart task registered. It runs as SYSTEM on every boot." -ForegroundColor Green

# ---------------- Registry Run Key fallback ----------------
Write-Host "Registering Run Key fallback..." -ForegroundColor Yellow

$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $regPath -Name "LiaisonEdge" -Value "`"$ExePath`" $ConfigArg"

Write-Host "Run Key registered" -ForegroundColor Green

# ---------------- Start immediately ----------------
Write-Host "Starting Edge..." -ForegroundColor Yellow

Start-Process `
    -FilePath $ExePath `
    -ArgumentList $ConfigArg `
    -WindowStyle Hidden

Start-Sleep -Seconds 2

$proc = Get-Process -Name "liaison-edge" -ErrorAction SilentlyContinue

if ($proc) {
    Write-Host "Edge is running." -ForegroundColor Green
    Write-Host "PID: $($proc.Id)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Edge failed to start." -ForegroundColor Red
    Write-Host "Please check logs at: $LogDir" -ForegroundColor Red
}

# ---------------- Cleanup ----------------
Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Liaison Edge installation completed successfully!" -ForegroundColor Green