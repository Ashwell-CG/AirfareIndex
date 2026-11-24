# Starts the backend (port 8000) and the frontend dev server (port 5173) from the correct folders.
# Usage (from the project root):  .\start-dev.ps1     Stop with Ctrl+C.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Write-Error "Missing $py - create the venv first (see README)."; exit 1 }
$api = Start-Process -PassThru -NoNewWindow -FilePath $py -ArgumentList '-m','uvicorn','app.main:app','--port','8000' -WorkingDirectory (Join-Path $root 'backend')
try {
  for ($i = 0; $i -lt 60; $i++) { try { if ((Invoke-WebRequest http://127.0.0.1:8000/ready -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { break } } catch { Start-Sleep 1 } }
  Write-Host 'Backend ready on http://127.0.0.1:8000 - starting frontend on http://localhost:5173'
  Push-Location (Join-Path $root 'frontend'); npm run dev; Pop-Location
} finally { if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force } }
