#!/usr/bin/env bash
# seshat-ui/scripts/start-docling.sh
# Launch docling-serve from the SeshatOS-managed Python venv (desktop app version).
#
# The backend binary auto-starts docling-serve when the venv is installed.
# Use this script only to run it manually as a standalone process.
#
# Usage:
#   ./scripts/start-docling.sh
#   DOCLING_PORT=5002 ./scripts/start-docling.sh
#   SESHAT_RUNTIME_ROOT=/custom/path ./scripts/start-docling.sh
#
# Environment variables:
#   SESHAT_RUNTIME_ROOT   Config/data root (default: ~/.config/seshat)
#   DOCLING_HOST         Bind address (default: 127.0.0.1)
#   DOCLING_PORT         HTTP port (default: 5001)
#   DOCLING_WORKERS      Parallel conversion workers (default: 1)

set -euo pipefail

_default_runtime_root() {
    if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        echo "$XDG_CONFIG_HOME/seshat"
    else
        echo "$HOME/.config/seshat"
    fi
}

SESHAT_RUNTIME_ROOT="${SESHAT_RUNTIME_ROOT:-$(_default_runtime_root)}"
VENV_DIR="$SESHAT_RUNTIME_ROOT/.venv"
# uv lays the venv out as Scripts/ (.exe binaries) on native Windows (this
# script itself runs fine there under git-bash/MSYS), bin/ everywhere else.
case "$(uname -s 2>/dev/null || echo Linux)" in
    MINGW*|MSYS*|CYGWIN*) DOCLING_BIN="$VENV_DIR/Scripts/docling-serve.exe" ;;
    *)                    DOCLING_BIN="$VENV_DIR/bin/docling-serve" ;;
esac

PORT="${DOCLING_PORT:-5001}"
HOST="${DOCLING_HOST:-127.0.0.1}"
WORKERS="${DOCLING_WORKERS:-1}"

# ── Ensure venv + docling-serve are installed ─────────────────────────────────
if [ ! -x "$DOCLING_BIN" ]; then
    echo "[docling] docling-serve not found. Running: ./scripts/install-python-env.sh"
    "$(dirname "$0")/install-python-env.sh"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo "[docling] Starting docling-serve on ${HOST}:${PORT} (workers: ${WORKERS})"
echo "[docling] Logs: $SESHAT_RUNTIME_ROOT/logs/docling.log"
echo ""

exec "$DOCLING_BIN" run \
  --host "${HOST}" \
  --port "${PORT}" \
  --workers "${WORKERS}"
