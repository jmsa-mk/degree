# Compatibility check only. Apache now owns the API; no separate server is started.
$ErrorActionPreference = 'Stop'
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1/degreebee/health' -TimeoutSec 3
    if ($health.service -ne 'degreebee') { throw 'Unexpected account service.' }
    Write-Output 'DegreeBee is ready through XAMPP Apache. Open the EXE directly.'
} catch {
    throw 'Start Apache and MySQL in XAMPP, then open the DegreeBee EXE. No backend script is required.'
}
