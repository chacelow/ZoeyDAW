$ErrorActionPreference = 'Stop'

# Rust builds on Windows: Git for Windows ships a coreutils `link` that shadows MSVC link.exe.
# This script takes the MSVC toolset and Windows SDK from the user-level LIB/INCLUDE (set once per
# machine), puts their link.exe and rc.exe first on PATH, then runs the command it is given:
#   powershell -File scripts/perf/rust-env.ps1 cargo install samply --locked
$env:INCLUDE = [Environment]::GetEnvironmentVariable('INCLUDE', 'User')
$env:LIB = [Environment]::GetEnvironmentVariable('LIB', 'User')
if (-not $env:LIB -or -not $env:INCLUDE) { throw 'User-level LIB and INCLUDE must point at the MSVC toolset and Windows SDK' }

$msvcLib = $env:LIB.Split(';') | Where-Object { $_ -match '\\VC\\Tools\\MSVC\\[^\\]+\\lib\\x64$' } | Select-Object -First 1
if (-not $msvcLib) { throw 'LIB has no MSVC x64 lib directory' }
$msvcBin = Join-Path (Split-Path (Split-Path $msvcLib)) 'bin\Hostx64\x64'
$linker = Join-Path $msvcBin 'link.exe'
if (-not (Test-Path $linker)) { throw "MSVC linker not found at $linker" }

# rc.exe lives under the SDK root's bin\<version>\x64; the SDK root is three levels above ucrt includes.
$ucrt = $env:INCLUDE.Split(';') | Where-Object { $_ -and (Test-Path (Join-Path $_ 'stddef.h')) -and $_ -match '\\ucrt' } | Select-Object -First 1
if (-not $ucrt) { throw 'INCLUDE does not provide ucrt\stddef.h' }
$rc = Get-ChildItem -Path (Split-Path (Split-Path (Split-Path $ucrt))) -Filter rc.exe -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\rc\.exe$' } | Select-Object -First 1
if (-not $rc) { throw 'rc.exe (x64) not found under the Windows SDK root' }

$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $linker
$env:Path = "$msvcBin;$($rc.DirectoryName);$env:Path"
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'Temp\gpuix-perf-target' }

if ($args.Count -gt 0) {
  & $args[0] @($args | Select-Object -Skip 1)
  exit $LASTEXITCODE
}
