# Khoi phuc zalo-crm-mvp tu Cursor Local History
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Admin\zalo-crm-mvp"
$historyRoot = "$env:APPDATA\Cursor\User\History"
$log = Join-Path $projectRoot "restore-run.log"

New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null
$restored = 0

Get-ChildItem -Path $historyRoot -Recurse -Filter "entries.json" | ForEach-Object {
    try {
        $meta = Get-Content $_.FullName -Raw | ConvertFrom-Json
        $resource = [string]$meta.resource
        if ($resource -notmatch "zalo-crm-mvp") { return }

        $rel = $resource -replace "^file:///c%3A/Users/Admin/zalo-crm-mvp/", "" -replace "^file:///C:/Users/Admin/zalo-crm-mvp/", ""
        if (-not $rel -or $rel -eq $resource) { return }

        $latest = $meta.entries | Sort-Object { [int64]$_.timestamp } -Descending | Select-Object -First 1
        if (-not $latest) { return }

        $src = Join-Path $_.DirectoryName $latest.id
        if (-not (Test-Path $src)) { return }

        $dest = Join-Path $projectRoot ($rel -replace "/", "\")
        $destDir = Split-Path $dest -Parent
        if ($destDir) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item -Path $src -Destination $dest -Force
        $script:restored++
    } catch {
        # skip broken history folders
    }
}

# Fallbacks da biet
$fallbacks = @(
    @{ Src = "$historyRoot\7220b8a4\swsy.js"; Dest = "app.js" },
    @{ Src = "$historyRoot\6cd44846\wuDN.html"; Dest = "app.html" },
    @{ Src = "$historyRoot\78829465\FapA.css"; Dest = "styles.css" },
    @{ Src = "$historyRoot\854e8a6\wHQP.js"; Dest = "server.js" },
    @{ Src = "$historyRoot\-13d72482\2W8I.json"; Dest = "package.json" }
)
foreach ($fb in $fallbacks) {
    if (Test-Path $fb.Src) {
        Copy-Item $fb.Src (Join-Path $projectRoot $fb.Dest) -Force
    }
}

$envPath = Join-Path $projectRoot ".env"
if (-not (Test-Path $envPath)) {
    @"
DATABASE_URL=postgresql://postgres:111@localhost:5432/zalo_crm
JWT_SECRET=dev-secret-change-me
PORT=3000
"@ | Set-Content $envPath -Encoding UTF8
}

"Restored files: $restored at $(Get-Date -Format o)" | Set-Content $log
Write-Host "Done. Restored ~$restored files -> $projectRoot"
Write-Host "Log: $log"
