$ErrorActionPreference = 'Stop'

# Native builds on this machine use a portable MSVC toolset plus a NuGet Windows SDK rather
# than a Visual Studio install. The user-level LIB/INCLUDE already point at both; this script
# adds the linker, rc.exe and a private target dir, then runs the command it is given.
$msvc = 'D:\vs-buildtools\VC\Tools\MSVC\14.44.35207'
$sdkBin = 'D:\Code\_tools\winsdk\microsoft.windows.sdk.cpp\c\bin\10.0.26100.0\x64'
$env:INCLUDE = [Environment]::GetEnvironmentVariable('INCLUDE', 'User')
$env:LIB = [Environment]::GetEnvironmentVariable('LIB', 'User')
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $msvc 'bin\Hostx64\x64\link.exe'
$env:Path = "$(Join-Path $msvc 'bin\Hostx64\x64');$sdkBin;$env:Path"
$env:GPUIX_GIT_EXECUTABLE = 'D:\software\Git\mingw64\bin\git.exe'
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'Temp\gpuix-perf-target' }

foreach ($header in @('ucrt\stddef.h', 'um\windows.h')) {
  $found = $env:INCLUDE.Split(';') | Where-Object { $_ -and (Test-Path (Join-Path $_ (Split-Path $header -Leaf))) }
  if (-not $found) { throw "INCLUDE does not provide $header" }
}

if ($args.Count -gt 0) {
  & $args[0] @($args | Select-Object -Skip 1)
  exit $LASTEXITCODE
}
