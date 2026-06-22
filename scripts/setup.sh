#!/usr/bin/env bash
# scripts/setup.sh
# One-command setup for SeshatOS app on Linux and macOS.
#
# What it does:
#   1. Verifies Node.js 20+ and bun (or npm)
#   2. Installs Node dependencies (bun install)
#   3. Installs uv and docling-serve (optional — skip with SKIP_PYTHON=1)
#   4. Builds the Electron app (electron-vite build)
#
# Usage:
#   ./scripts/setup.sh
#   SKIP_PYTHON=1 ./scripts/setup.sh     # skip docling setup
#   DOCLING_EXTRAS=gpu ./scripts/setup.sh
#
# Environment variables:
#   SESHAT_RUNTIME_ROOT   Override data dir (default: ~/.config/seshat)
#   DOCLING_EXTRAS       pip extras for docling-serve (e.g. "gpu")
#   PYTHON_VERSION       Python version for the venv (default: 3.11)
#   SKIP_PYTHON          Set to 1 to skip the Python/docling setup step

set -euo pipefail

OS="$(uname -s)"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="$REPO_ROOT/seshat-ui"

if [ -z "${SESHAT_RUNTIME_ROOT:-}" ]; then
    if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        SESHAT_RUNTIME_ROOT="$XDG_CONFIG_HOME/seshat"
    else
        SESHAT_RUNTIME_ROOT="$HOME/.config/seshat"
    fi
fi
export SESHAT_RUNTIME_ROOT

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
info() { echo -e "${BLUE}  ·${NC}  $*"; }
warn() { echo -e "${YELLOW}  !${NC}  $*"; }
fail() { echo -e "${RED}  ✗${NC}  $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}$*${NC}"; }

# ── 1. Node.js ────────────────────────────────────────────────────────────────
step "Checking Node.js..."

if ! command -v node &>/dev/null; then
    fail "Node.js not found. Install Node.js 20+ from: https://nodejs.org/"
fi

NODE_VERSION="$(node --version | sed 's/v//' | cut -d. -f1)"
if [ "$NODE_VERSION" -lt 20 ]; then
    fail "Node.js v$NODE_VERSION found but v20+ is required."
fi
ok "Node.js $(node --version)"

# ── 2. Package manager ────────────────────────────────────────────────────────
step "Checking package manager..."

if command -v bun &>/dev/null; then
    PKG_INSTALL="bun install"
    ok "bun $(bun --version)"
elif command -v npm &>/dev/null; then
    PKG_INSTALL="npm install --legacy-peer-deps"
    ok "npm $(npm --version)"
else
    fail "Neither bun nor npm found."
fi

# ── 3. Install Node dependencies ──────────────────────────────────────────────
step "Installing Node dependencies..."

cd "$UI_DIR"
$PKG_INSTALL
ok "Node dependencies installed"

# ── 4. Python venv + docling-serve (optional) ────────────────────────────────
if [ "${SKIP_PYTHON:-0}" = "1" ]; then
    warn "Skipping Python/docling setup (SKIP_PYTHON=1)"
    warn "Run './scripts/install-python-env.sh' later to enable document conversion."
else
    step "Setting up Python environment (docling-serve)..."
    bash "$REPO_ROOT/scripts/install-python-env.sh"
fi

# ── 5. Build ──────────────────────────────────────────────────────────────────
step "Building SeshatOS UI..."

cd "$UI_DIR"
if command -v bun &>/dev/null; then
    bun run build
else
    npm run build --legacy-peer-deps
fi
ok "Build complete → seshat-ui/out/"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  Setup complete!${NC}"
echo ""
echo "  Runtime data: $SESHAT_RUNTIME_ROOT"
echo ""
echo "  Start in dev mode (from repo root):"
echo "    make dev"
echo ""
case "$OS" in
    Linux|Darwin) echo "  Package for distribution: make ui-build" ;;
esac
echo ""
