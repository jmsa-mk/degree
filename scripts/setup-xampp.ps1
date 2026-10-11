# One-time developer setup. Daily use only needs XAMPP Apache + MySQL and the EXE.
param([string]$XamppRoot = 'C:\xampp')
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$apacheRoot = Join-Path $XamppRoot 'apache'
$httpd = Join-Path $apacheRoot 'bin\httpd.exe'
$mainConfig = Join-Path $apacheRoot 'conf\httpd.conf'
$apiConfig = Join-Path $apacheRoot 'conf\extra\httpd-degreebee.conf'
$publicRoot = (Join-Path $project 'server\public').Replace('\','/')
if (!(Test-Path -LiteralPath $httpd) -or !(Test-Path -LiteralPath "$project\server\config.local.php")) {
    throw 'XAMPP or the existing DegreeBee database configuration is missing.'
}
$previousMain = [IO.File]::ReadAllText($mainConfig)
$previousApi = if (Test-Path -LiteralPath $apiConfig) { [IO.File]::ReadAllText($apiConfig) } else { $null }
$include = 'Include "conf/extra/httpd-degreebee.conf"'
$nextMain = $previousMain
if ($previousMain -notmatch '(?m)^\s*Include\s+"?conf/extra/httpd-degreebee\.conf"?\s*$') { $nextMain += "`r`n$include`r`n" }
$template = [IO.File]::ReadAllText("$project\server\apache-degreebee.conf").Replace('D:/Coding/Venture Creation/Prototype/server/public', $publicRoot)
$backup = "$mainConfig.degreebee-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $mainConfig -Destination $backup
try {
    [IO.File]::WriteAllText($apiConfig, $template)
    [IO.File]::WriteAllText($mainConfig, $nextMain)
    # Windows PowerShell treats native stderr as an error; Apache prints Syntax OK there.
    $ErrorActionPreference = 'Continue'
    & $httpd -d $apacheRoot -t
    $syntaxResult = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($syntaxResult -ne 0) { throw 'Apache rejected the new configuration.' }
} catch {
    [IO.File]::WriteAllText($mainConfig, $previousMain)
    if ($null -eq $previousApi) { Remove-Item -LiteralPath $apiConfig -ErrorAction SilentlyContinue }
    else { [IO.File]::WriteAllText($apiConfig, $previousApi) }
    throw
}
Write-Output 'DegreeBee Apache configuration installed. Restart Apache once in XAMPP.'
Write-Output 'After that, start Apache and MySQL, then open the DegreeBee EXE directly.'
