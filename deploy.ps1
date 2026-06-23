param(
    [string]$Token = "",
    [string]$RepoName = "nova-web"
)

$Headers = @{
    "Authorization" = "token $Token"
    "User-Agent"    = "nova-deploy"
    "Accept"        = "application/vnd.github.v3+json"
}

# 1) Get username
Write-Host "Fetching GitHub username..." -ForegroundColor Cyan
$User = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $Headers
$Username = $User.login
Write-Host "  Logged in as: $Username" -ForegroundColor Green

# 2) Create repo (ignore if already exists)
Write-Host "Creating GitHub repo '$RepoName'..." -ForegroundColor Cyan
try {
    $Body = @{ name = $RepoName; description = "Nova AI Web Portal"; private = $false; auto_init = $false } | ConvertTo-Json
    Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method POST -Headers $Headers -Body $Body -ContentType "application/json" | Out-Null
    Write-Host "  Repo created!" -ForegroundColor Green
} catch {
    Write-Host "  Repo may already exist, continuing..." -ForegroundColor Yellow
}

# 3) Initialise git and push
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GitExe = "$env:USERPROFILE\scoop\shims\git.exe"

Set-Location $ScriptDir

& $GitExe init
& $GitExe config user.email "nova@deploy.local"
& $GitExe config user.name  $Username

# Set remote with token embedded
$RemoteUrl = "https://${Username}:${Token}@github.com/${Username}/${RepoName}.git"
& $GitExe remote remove origin 2>$null
& $GitExe remote add origin $RemoteUrl

& $GitExe add -A
& $GitExe commit -m "Nova AI Web Portal - initial deploy"
& $GitExe branch -M main
& $GitExe push -u origin main --force

Write-Host ""
Write-Host "SUCCESS! Repo pushed to: https://github.com/$Username/$RepoName" -ForegroundColor Green
Write-Host "Now go to https://vercel.com/new and import that repo to deploy!" -ForegroundColor Cyan
