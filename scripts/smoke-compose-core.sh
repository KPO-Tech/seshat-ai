#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-seshat-core-smoke}"
API_PORT="${SMOKE_SESHAT_SERVER_PORT:-18081}"
CONSOLE_PORT="${SMOKE_SESHAT_CONSOLE_PORT:-13000}"
MAILPIT_SMTP_PORT="${SMOKE_MAILPIT_SMTP_PORT:-11025}"
MAILPIT_WEB_PORT="${SMOKE_MAILPIT_WEB_PORT:-18025}"
POSTGRES_PASSWORD="${SMOKE_POSTGRES_PASSWORD:-seshat-smoke-postgres}"
ENCRYPTION_KEY="${SMOKE_SESHAT_SERVER_ENCRYPTION_KEY:-0123456789abcdefghijklmnopqrstuvwxyzABCDEF0123456789abcdefghijklmn}"

compose() {
    COMPOSE_PROJECT_NAME="$PROJECT_NAME" \
    POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    SESHAT_SERVER_ENCRYPTION_KEY="$ENCRYPTION_KEY" \
    SESHAT_SERVER_PORT="$API_PORT" \
    SESHAT_CONSOLE_PORT="$CONSOLE_PORT" \
    MAILPIT_SMTP_PORT="$MAILPIT_SMTP_PORT" \
    MAILPIT_WEB_PORT="$MAILPIT_WEB_PORT" \
    DEPLOY_DOCLING_URL= \
        docker compose "$@"
}

cleanup() {
    cd "$DEPLOY_DIR"
    compose down -v --remove-orphans
}
trap cleanup EXIT

wait_for_url() {
    local url="$1"
    local label="$2"
    local attempts="${3:-60}"

    for _ in $(seq 1 "$attempts"); do
        if curl -fsS "$url" >/dev/null; then
            echo "[smoke] $label is responding at $url"
            return 0
        fi
        sleep 2
    done

    echo "[smoke] $label did not become ready at $url" >&2
    compose ps >&2 || true
    compose logs --no-color seshat-server seshat-console postgres mailpit >&2 || true
    return 1
}

cd "$DEPLOY_DIR"

compose up --build -d postgres mailpit seshat-server seshat-console

wait_for_url "http://127.0.0.1:${API_PORT}/health" "seshat-server health"
wait_for_url "http://127.0.0.1:${CONSOLE_PORT}/" "seshat-console"

echo "[smoke] compose core stack passed"
