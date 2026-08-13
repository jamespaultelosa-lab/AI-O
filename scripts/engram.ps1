[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $EngramArgs
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$env:ENGRAM_HOME = Join-Path $projectRoot '.engram'
$env:PYTHONUTF8 = '1'

if ($env:ENGRAM_ENGINE) {
    $engine = $env:ENGRAM_ENGINE
} else {
    $cacheRoot = Join-Path $env:USERPROFILE '.codex\plugins\cache\engram\engram'
    $engine = Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'scripts\engram.py' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
}

if (-not $engine) {
    throw 'Engram is not installed. Install the engram Codex plugin, or set ENGRAM_ENGINE to its engram.py path.'
}

& python $engine @EngramArgs
exit $LASTEXITCODE
