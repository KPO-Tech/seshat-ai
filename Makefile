# Nexus — Development Makefile
#
#   make          → show this help
#   make dev      → start backend + Electron UI
#   make test     → run all Go tests
#   make build    → compile the backend binary

ROOT   := $(shell pwd)
BIN    := nexus-engine
CMD    := ./cmd/api
UI_DIR := $(ROOT)/nexus-ui

# Detect OS for open/xdg-open
UNAME := $(shell uname -s)

.PHONY: help \
        dev stop \
        build run \
        test test-v test-race test-short \
        fmt vet lint tidy hooks \
        ui-install ui-build ui-dev \
        logs logs-last \
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
	@pkill -f "electron" 2>/dev/null || true
	@printf '\033[32m[nexus]\033[0m stopped.\n'

# ─── Backend ──────────────────────────────────────────────────────────────────

build: ## Compile the backend binary → ./nexus-engine
	@printf '\033[32m[go]\033[0m building %s…\n' $(BIN)
	@go build -o $(BIN) $(CMD)
	@printf '\033[32m[go]\033[0m binary ready: %s/%s\n' $(ROOT) $(BIN)

run: ## Run the backend only (no UI), reads .env.dev / .env
	go run $(CMD)

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
	gofmt -w $(shell find . -name "*.go" -not -path "./nexus-engine/*" -not -path "./nexus-skills/*" -not -path "./vendor/*")

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

# ─── Logs ─────────────────────────────────────────────────────────────────────

logs: ## Tail the backend log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${NEXUS_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf '\033[32m[logs]\033[0m %s\n\n' "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf '\033[33m[logs]\033[0m no log file at %s — start the backend first.\n' "$$LOG"; \
	 fi

logs-last: ## Show the last 200 lines of the backend log
	@RUNTIME_ROOT=$${NEXUS_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   tail -200 "$$LOG"; \
	 else \
	   printf '\033[33m[logs]\033[0m no log file at %s.\n' "$$LOG"; \
	 fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────

clean: ## Remove the compiled binary
	rm -f $(BIN)
	go clean

clean-all: clean ## Remove binary, Go build cache, UI node_modules + dist
	go clean -cache
	rm -rf $(UI_DIR)/node_modules $(UI_DIR)/dist $(UI_DIR)/out
	@printf '\033[32m[clean]\033[0m done.\n'
