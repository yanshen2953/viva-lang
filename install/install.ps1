# Install Viva CLI on Windows (PowerShell).
# Usage: irm <raw-url>/install/install.ps1 | iex
#    or: .\install\install.ps1

$ErrorActionPreference = "Stop"
$Prefix = if ($env:VIVA_PREFIX) { $env:VIVA_PREFIX } else { Join-Path $env:LOCALAPPDATA "viva-lang" }
$Repo = if ($env:VIVA_REPO) { $env:VIVA_REPO } else { "https://github.com/yanshen2953/viva-lang.git" }

Write-Host "Installing viva-lang → $Prefix"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required (Node.js >= 18). Install from https://nodejs.org/"
}

New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
$Tmp = Join-Path $env:TEMP ("viva-install-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
  if ((Test-Path ".\package.json") -and (Select-String -Path ".\package.json" -Pattern '"name": "viva-lang"' -Quiet)) {
    Write-Host "Using local checkout…"
    npm install --omit=dev
    npm run build:lib
    npm install -g --prefix $Prefix .
  } else {
    Write-Host "Fetching $Repo …"
    git clone --depth 1 $Repo (Join-Path $Tmp "viva-lang")
    Set-Location (Join-Path $Tmp "viva-lang")
    npm install --omit=dev
    npm run build:lib
    npm install -g --prefix $Prefix .
  }
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}

$Bin = Join-Path $Prefix "bin"
Write-Host ""
Write-Host "Add to PATH if needed:"
Write-Host "  $Bin"
Write-Host ""
Write-Host "Done. Try: viva version"
