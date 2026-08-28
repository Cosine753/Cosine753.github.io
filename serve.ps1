$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $wb = Join-Path $env:USERPROFILE ".workbuddy\binaries\node\versions"
  if (Test-Path $wb) {
    $found = Get-ChildItem $wb -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  throw "Node.js not found. Install Node, or keep the WorkBuddy node binary."
}

$node = Find-Node
& $node build.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $node serve.mjs
