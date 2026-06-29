# Nexus — Development Makefile
#
#   make setup          → first-time setup (Node deps + docling + build)
#   make dev            → start backend + Electron UI
#   make build          → compile the backend binary
#   make test           → run all Go tests
#   make install-python → install / update docling-serve
#   make start-docling  → start docling-serve manually

ROOT        := $(shell pwd)
BIN         := seshat
CMD         := ./cmd/api
UI_DIR      := $(ROOT)/seshat-ui
DAEMON_DIR  := $(ROOT)/seshat
DAEMON_BIN  := seshat-automation
DAEMON_CMD  := ./cmd/automation-server

# Detect OS for open/xdg-open
UNAME := $(shell uname -s)

.PHONY: help \
        setup \
        dev stop dev-full \
        build run \
        build-automation run-automation \
        test test-v test-race test-short test-pkg \
        fmt vet lint tidy hooks \
        ui-install ui-build ui-dev \
        install-python start-docling \
        logs logs-last logs-docling \
        clean clean-all

.DEFAULT_GOAL := help

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show available targets
	@printf '\n  \033[1mNexus — make targets\033[0m\n\n'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@printf '\n'

# ─── Dev lifecycle ────────────────────────────────────────────────────────────

dev: ui-install ## Start backend + Electron UI
	@printf '\033[32m[nexus]\033[0m starting backend…\n'
	@go run $(CMD) &
	@printf '\033[32m[nexus]\033[0m starting Electron UI…\n'
	@cd $(UI_DIR) && bun run start

stop: ## Stop backend and UI processes
	@pkill -f "go run.*cmd/api" 2>/dev/null || true
	@pkill -x api 2>/dev/null || true
	@pkill -f "electron-vite" 2>/dev/null || true
	@pkill -f "[e]lectron.*nexus" 2>/dev/null || true
	@pkill -x seshat-automation 2>/dev/null || true
	@printf '\033[32m[nexus]\033[0m stopped.\n'

dev-full: ui-install ## Start backend + automation daemon + Electron UI
	@printf '\033[32m[nexus]\033[0m starting backend…\n'
	@go run $(CMD) &
	@printf '\033[32m[nexus]\033[0m starting automation daemon…\n'
	@cd $(DAEMON_DIR) && go run $(DAEMON_CMD) &
	@printf '\033[32m[nexus]\033[0m starting Electron UI…\n'
	@cd $(UI_DIR) && bun run start

# ─── Backend ──────────────────────────────────────────────────────────────────

build: ## Compile the backend binary → ./seshat
	@printf '\033[32m[go]\033[0m building %s…\n' $(BIN)
	@go build -o $(BIN) $(CMD)
	@printf '\033[32m[go]\033[0m binary ready: %s/%s\n' $(ROOT) $(BIN)

run: ## Run the backend only (no UI), reads .env.dev / .env
	go run $(CMD)

build-automation: ## Compile the automation daemon binary → seshat/seshat-automation
	@printf '\033[32m[go]\033[0m building %s…\n' $(DAEMON_BIN)
	@cd $(DAEMON_DIR) && go build -o $(DAEMON_BIN) $(DAEMON_CMD)
	@printf '\033[32m[go]\033[0m binary ready: %s/%s\n' $(DAEMON_DIR) $(DAEMON_BIN)

run-automation: ## Run the automation daemon only (reads env / .env)
	@cd $(DAEMON_DIR) && go run $(DAEMON_CMD)

# ─── Tests ────────────────────────────────────────────────────────────────────

test: ## Run all Go tests
	go test ./...

test-v: ## Run all tests — verbose output
	go test -v ./...

test-race: ## Run all tests with the race detector
	go test -race ./...

test-short: ## Run fast unit tests only (skips DB-backed tests)
	go test -short ./...

test-pkg: ## Run tests for a specific package  (PKG=./internal/scheduler/...)
	go test -v $(PKG)

# ─── Code quality ─────────────────────────────────────────────────────────────

fmt: ## Format all Go source files with gofmt
	gofmt -w $(shell find . -name "*.go" -not -path "./seshat/*" -not -path "./seshat-skills/*" -not -path "./vendor/*")

vet: ## Run go vet across all packages
	go vet ./...

lint: vet ## vet + staticcheck (install: go install honnef.co/go/tools/cmd/staticcheck@latest)
	@command -v staticcheck >/dev/null 2>&1 \
	  && staticcheck ./... \
	  || printf '\033[33m[warn]\033[0m staticcheck not found — install with:\n       go install honnef.co/go/tools/cmd/staticcheck@latest\n'

tidy: ## go mod tidy + verify
	go mod tidy
	go mod verify

hooks: ## Install git hooks from .githooks/
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@printf '\033[32m[hooks]\033[0m pre-commit hook installed.\n'

# ─── UI ───────────────────────────────────────────────────────────────────────

ui-install: ## Install UI dependencies via bun
	@if [ ! -d "$(UI_DIR)/node_modules" ]; then \
	  printf '\033[32m[ui]\033[0m installing dependencies…\n'; \
	  cd $(UI_DIR) && bun install; \
	else \
	  printf '\033[32m[ui]\033[0m node_modules present — skipping install\n'; \
	fi

ui-build: ui-install ## Build UI for production (Electron package)
	cd $(UI_DIR) && bun run build

ui-dev: ui-install ## Start Vite dev server only (web preview, no Electron)
	cd $(UI_DIR) && bun run dev

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## First-time setup: Node deps + docling-serve + backend build
	@bash scripts/setup.sh

# ─── Python / docling (optional feature) ─────────────────────────────────────
# install-python creates the managed venv and installs docling-serve.
# Called automatically by `make setup`. Use to install or update docling.
#
# Options (env vars):
#   DOCLING_EXTRAS=gpu      → GPU-accelerated conversion
#   PYTHON_VERSION=3.12     → specific Python version

install-python: ## Install / update docling-serve in the managed venv
	@bash scripts/install-python-env.sh

# Start docling-serve manually.
# The backend auto-starts it at launch when the venv is installed.
# Use this only to run it as a standalone process.

start-docling: ## Start docling-serve manually (auto-started by the backend)
	@bash scripts/start-docling.sh

# ─── Logs ─────────────────────────────────────────────────────────────────────

logs: ## Tail the backend log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf '\033[32m[logs]\033[0m %s\n\n' "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf '\033[33m[logs]\033[0m no log file at %s — start the backend first.\n' "$$LOG"; \
	 fi

logs-last: ## Show the last 200 lines of the backend log
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   tail -200 "$$LOG"; \
	 else \
	   printf '\033[33m[logs]\033[0m no log file at %s.\n' "$$LOG"; \
	 fi

logs-docling: ## Tail the docling-serve log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/docling.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf '\033[32m[logs]\033[0m %s\n\n' "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf '\033[33m[logs]\033[0m no docling log at %s — start the backend first.\n' "$$LOG"; \
	 fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────

clean: ## Remove the compiled binary
	rm -f $(BIN)
	go clean

clean-all: clean ## Remove binary, Go build cache, UI node_modules + dist
	go clean -cache
	rm -rf $(UI_DIR)/node_modules $(UI_DIR)/dist $(UI_DIR)/out
	@printf '\033[32m[clean]\033[0m done.\n'
