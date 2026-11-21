[CmdletBinding()]
param(
    [string]$StoragePath
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') {
    throw 'Run this script on the Windows Docker host.'
}

if (-not $StoragePath) {
    try {
        $share = Get-SmbShare -Name Scanner -ErrorAction Stop
    } catch {
        throw "Cannot read the local Scanner share. Run on the file server with access to Get-SmbShare, or pass the existing local folder with -StoragePath. $($_.Exception.Message)"
    }
    $StoragePath = Join-Path $share.Path 'PDA-Camera'
}

if ($StoragePath -notmatch '^[A-Za-z]:[\\/]') {
    throw "Storage must be a local Windows path such as D:/Shares/Scanner/PDA-Camera. Received: $StoragePath"
}

$directory = Get-Item -LiteralPath $StoragePath -ErrorAction SilentlyContinue
if (-not $directory -or -not $directory.PSIsContainer) {
    throw "Storage folder does not exist or is not accessible: $StoragePath"
}
if ($directory.PSDrive.DisplayRoot -or [IO.DriveInfo]::new($directory.Root.FullName).DriveType -eq 'Network') {
    throw "Storage uses a network drive. Run Docker on the file server or pass a local folder Docker can mount: $StoragePath"
}

$projectRoot = Join-Path $PSScriptRoot '../..'
$previousStoragePath = $env:STORAGE_HOST_PATH
Push-Location -LiteralPath $projectRoot
try {
    $env:STORAGE_HOST_PATH = $directory.FullName.Replace('\', '/')
    Write-Host "Using STORAGE_HOST_PATH=$env:STORAGE_HOST_PATH"
    docker compose up -d --build --wait --wait-timeout 60
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed with exit code $LASTEXITCODE."
    }
} finally {
    $env:STORAGE_HOST_PATH = $previousStoragePath
    Pop-Location
}
