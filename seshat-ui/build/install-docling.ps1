param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeRoot,
    [string]$PythonVersion = "3.11"
)

$ErrorActionPreference = "Stop"

function Info { param($m) Write-Host "[docling-setup] $m" }
function Warn { param($m) Write-Host "[docling-setup] WARNING: $m" -ForegroundColor Yellow }

try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Info "Installing uv..."
        Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + $env:PATH
    }
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw "uv still not found on PATH after install attempt"
    }

    $venvDir = Join-Path $RuntimeRoot ".venv"
    $doclingBin = Join-Path $venvDir "Scripts\docling-serve.exe"

    if (-not (Test-Path $doclingBin)) {
        New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
        Info "Creating Python $PythonVersion venv at $venvDir..."
        uv venv $venvDir --python $PythonVersion --seed
        if ($LASTEXITCODE -ne 0) { throw "uv venv failed with exit code $LASTEXITCODE" }

        $pyBin = Join-Path $venvDir "Scripts\python.exe"
        # Pinned >=1.28.0 - 1.27.0 crashes at import (see scripts/install-python-env.sh).
        $pkg = "docling-serve>=1.28.0"
        Info "Installing $pkg..."
        uv pip install --python $pyBin $pkg
        if ($LASTEXITCODE -ne 0) { throw "uv pip install failed with exit code $LASTEXITCODE" }
    } else {
        Info "docling-serve already present at $doclingBin - skipping."
    }

    $sitePackages = Join-Path $venvDir "Lib\site-packages"
    if (Test-Path $sitePackages) {
        Info "Installing console-encoding fix..."
        # Verbatim from scripts/install-python-env.sh's sitecustomize.py heredoc.
        $sitecustomize = @'
"""Seshat-managed venv startup hook.

Fixes a Windows-only crash where docling-serve's startup banner (built on
rich/uvicorn) dies with a UnicodeEncodeError while writing an emoji, whenever
stdout/stderr are redirected to a file rather than a real console (see
seshat/internal/python DoclingManager.Start, which redirects docling-serve's
output to a log file):

1. rich decides whether a stream is a "legacy Windows console" by querying
   GetConsoleMode on it - which always fails for a redirected file, so rich
   falls back to a legacy byte-mode console writer that can't encode most
   Unicode. Patched here to report modern (VT-capable) console features.
2. Even off that legacy path, Python's own stdout/stderr TextIOWrapper still
   defaults to the OS ANSI codepage (cp1252) for a non-console stream, which
   still can't encode the emoji. Reconfigured here to UTF-8.
"""
import sys

if sys.platform == "win32":
    try:
        import rich.console
        from rich._windows import WindowsConsoleFeatures

        _features = WindowsConsoleFeatures(vt=True, truecolor=True)
        rich.console.get_windows_console_features = lambda: _features
    except ImportError:
        pass

    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8")
            except Exception:
                pass
'@
        Set-Content -Path (Join-Path $sitePackages "sitecustomize.py") -Value $sitecustomize -Encoding utf8
    }

    Info "Docling setup complete."
    exit 0
} catch {
    Warn "$_"
    exit 1
}
