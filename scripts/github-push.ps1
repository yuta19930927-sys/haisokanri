# One-time: authenticate GitHub CLI in this folder, then create repo and push.
# Run from PowerShell:  .\scripts\github-push.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub CLI is not logged in. Starting web login..." -ForegroundColor Yellow
  gh auth login --hostname github.com --git-protocol https --web
}

$repo = "haisokanri"
$owner = "yuta19930927"

# If origin already exists, push only
$hasOrigin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Remote 'origin' exists. Pushing to main..." -ForegroundColor Cyan
  git push -u origin main
  exit 0
}

Write-Host "Creating https://github.com/$owner/$repo and pushing..." -ForegroundColor Cyan
gh repo create "$repo" --public --source=. --remote=origin --push --description "Delivery management (Vite + React + Supabase)"

Write-Host "Done. Repository: https://github.com/$owner/$repo" -ForegroundColor Green
