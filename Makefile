# Nexus - Development Makefile
#
#   make setup          -> first-time setup (Node deps + docling + build)
#   make dev            -> start local backend + Electron UI
#   make build          -> compile the local backend binary
#   make test           -> run all Go tests in the workspace
#   make install-python -> install / update docling-serve
#   make start-docling  -> start docling-serve manually
#   make deploy-up      -> build + start the default deploy stack
#   make deploy-down    -> stop that stack
#
# Windows: works from PowerShell, cmd, or Git Bash. Two separate things need
# fixing, both handled below from a bare "Git for Windows installed" state:
#   1. Which shell runs a recipe - GNU Make's own shell-detection doesn't
#      pick up Git's sh.exe from a plain PowerShell/cmd PATH the way a Git
#      Bash session already does, so SHELL is pointed at it explicitly.
#   2. Make's Windows port bypasses the shell for recipe lines it judges
#      "simple" (no quotes/operators) and execs the first word directly via
#      CreateProcess - so coreutils this file uses throughout (mkdir, rm,
#      printf, awk, ...) need to resolve on PATH even for that bypassed
#      case, not only when a real shell ends up running them. Git's usr/bin
#      (not bin - that one only has sh.exe/bash.exe) ships all of them.
# UI package manager and process-kill in `stop` auto-detect and fall back to
# npm/PowerShell separately, for machines without bun/pkill installed.

ifeq ($(OS),Windows_NT)
  ifneq ($(wildcard C:/Program\ Files/Git/bin/sh.exe),)
    GIT_ROOT_WIN := C:/Program Files/Git
  else ifneq ($(wildcard C:/Program\ Files\ (x86)/Git/bin/sh.exe),)
    GIT_ROOT_WIN := C:/Program Files (x86)/Git
  else ifneq ($(wildcard $(subst \,/,$(LOCALAPPDATA))/Programs/Git/bin/sh.exe),)
    GIT_ROOT_WIN := $(subst \,/,$(LOCALAPPDATA))/Programs/Git
  endif
  ifneq ($(GIT_ROOT_WIN),)
    SHELL := $(GIT_ROOT_WIN)/bin/sh.exe
    .SHELLFLAGS := -c
    export PATH := $(GIT_ROOT_WIN)/usr/bin;$(PATH)
  endif
endif

# CURDIR is a Make built-in (no subprocess needed) - equivalent to `pwd` but
# works even before the SHELL override above takes effect for $(shell ...).
ROOT              := $(CURDIR)
GO_PACKAGES       := ./seshat-backend/... ./seshat-server/...
LINT_PACKAGES     := ./seshat-backend/... ./seshat-server/...
BACKEND_DIR       := $(ROOT)/seshat-backend
BACKEND_CMD       := ./cmd/api
BACKEND_BIN_DIR   := $(BACKEND_DIR)/bin
BACKEND_BIN       := seshat-api
BACKEND_BIN_PATH  := $(BACKEND_BIN_DIR)/$(BACKEND_BIN)
SERVER_DIR        := $(ROOT)/seshat-server
SERVER_CMD        := ./cmd/server
SERVER_BIN_DIR    := $(SERVER_DIR)/bin
SERVER_BIN        := seshat-server
SERVER_BIN_PATH   := $(SERVER_BIN_DIR)/$(SERVER_BIN)
UI_DIR            := $(ROOT)/seshat-ui
CONSOLE_DIR       := $(ROOT)/seshat-console
WEBSITE_DIR       := $(ROOT)/website
DAEMON_BIN        := seshat-automation
DAEMON_BIN_DIR    := $(ROOT)/bin
DAEMON_BIN_PATH   := $(DAEMON_BIN_DIR)/$(DAEMON_BIN)
DAEMON_PKG        := github.com/KPO-Tech/seshat/cmd/automation-server
SESHAT_VERSION    := v1.0.2
DEPLOY_DIR        := $(ROOT)/deploy
GO_BUILD_CACHE    := $(ROOT)/.cache/go-build
GOLANGCI_CACHE    := $(ROOT)/.cache/golangci-lint

# UI package manager: prefer bun (faster, what CI/most contributors use), but
# fall back to npm when bun isn't installed - e.g. a fresh Windows machine.
# Both understand `install` and `run <script>` identically, so every ui-*
# target below works unmodified under either. Routed through $(SHELL)
# explicitly (not bare $(shell ...)) so this also resolves correctly on
# Windows - see the SHELL auto-detection note above.
UI_PKG_MGR := $(shell $(SHELL) -c 'command -v bun >/dev/null 2>&1 && echo bun || echo npm')

.PHONY: help \
        setup setup-all setup-desktop setup-web setup-legacy \
        dev stop dev-full \
        build run build-server run-server \
        build-automation run-automation \
        test test-v test-race test-short test-pkg \
        fmt vet lint tidy hooks \
        install-all build-all \
        ui-install ui-build ui-dev \
        desktop-install desktop-build desktop-dev \
        console-install console-build console-dev \
        website-install website-build website-dev \
        install-python start-docling \
        logs logs-last logs-docling \
        deploy-env deploy-up deploy-up-core deploy-up-docs deploy-up-search deploy-up-s3 deploy-up-full deploy-smoke-core \
        deploy-build deploy-pull deploy-down deploy-logs deploy-ps \
        clean clean-all

.DEFAULT_GOAL := help

# Help

help: ## Show available targets
	@printf "\n  \033[1mNexus - make targets\033[0m\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@printf "\n"

# Dev lifecycle

dev: stop ui-install ## Start local backend + Electron UI
	@printf "\033[32m[nexus]\033[0m starting local backend...\n"
	@cd $(BACKEND_DIR) && go run $(BACKEND_CMD) &
	@printf "\033[32m[nexus]\033[0m starting Electron UI...\n"
	@cd $(UI_DIR) && $(UI_PKG_MGR) run start

# `go run` executes a temp binary named after the last path segment of the
# package (./cmd/api -> "api", ./cmd/server -> "server", .../automation-server
# -> "automation-server") - NOT "go" and NOT the seshat-api/seshat-server
# names those only apply to `make build`'s actual output binaries. Matching
# only the old names silently no-ops on every `go run`-started dev process,
# which is how port 8090 ends up squatted by an orphaned backend from a
# previous run (see helps/ dev-mode footgun notes). Match both.
stop: ## Stop backend, server, automation, and UI processes
	@if command -v pkill >/dev/null 2>&1; then \
	  pkill -f "go run.*cmd/api" 2>/dev/null || true; \
	  pkill -f "go run.*cmd/server" 2>/dev/null || true; \
	  pkill -f "automation-server" 2>/dev/null || true; \
	  pkill -x api 2>/dev/null || true; \
	  pkill -x server 2>/dev/null || true; \
	  pkill -x $(BACKEND_BIN) 2>/dev/null || true; \
	  pkill -x $(SERVER_BIN) 2>/dev/null || true; \
	  pkill -f "electron-vite" 2>/dev/null || true; \
	  pkill -f "[e]lectron.*nexus" 2>/dev/null || true; \
	  pkill -x $(DAEMON_BIN) 2>/dev/null || true; \
	elif command -v powershell.exe >/dev/null 2>&1; then \
	  powershell.exe -NoProfile -Command \
	    "Get-CimInstance Win32_Process | Where-Object { \$$_.Name -match '^(api|server|automation-server|go|seshat-api|seshat-server|seshat-automation)(\.exe)?\$$' -or (\$$_.Name -match '^(electron|node)(\.exe)?\$$' -and \$$_.CommandLine -match 'electron-vite|seshat-ui') } | ForEach-Object { Stop-Process -Id \$$_.ProcessId -Force -ErrorAction SilentlyContinue }" \
	    2>/dev/null || true; \
	fi
	@printf "\033[32m[nexus]\033[0m stopped.\n"

dev-full: stop ui-install ## Start local backend + automation daemon + Electron UI
	@printf "\033[32m[nexus]\033[0m starting local backend...\n"
	@cd $(BACKEND_DIR) && go run $(BACKEND_CMD) &
	@printf "\033[32m[nexus]\033[0m starting automation daemon...\n"
	@go run $(DAEMON_PKG)@$(SESHAT_VERSION) &
	@printf "\033[32m[nexus]\033[0m starting Electron UI...\n"
	@cd $(UI_DIR) && $(UI_PKG_MGR) run start

# Backend

build: ## Compile the local backend binary -> seshat-backend/bin/seshat-api
	@printf "\033[32m[go]\033[0m building %s...\n" $(BACKEND_BIN)
	@mkdir -p $(BACKEND_BIN_DIR)
	@cd $(BACKEND_DIR) && go build -o ./bin/$(BACKEND_BIN) $(BACKEND_CMD)
	@printf "\033[32m[go]\033[0m binary ready: %s\n" $(BACKEND_BIN_PATH)

run: ## Run the local backend only (no UI), reads .env.dev / .env
	@cd $(BACKEND_DIR) && go run $(BACKEND_CMD)

build-server: ## Compile the cloud server binary -> seshat-server/bin/seshat-server
	@printf "\033[32m[go]\033[0m building %s...\n" $(SERVER_BIN)
	@mkdir -p $(SERVER_BIN_DIR)
	@cd $(SERVER_DIR) && go build -o ./bin/$(SERVER_BIN) $(SERVER_CMD)
	@printf "\033[32m[go]\033[0m binary ready: %s\n" $(SERVER_BIN_PATH)

run-server: ## Run the cloud server only (auth/org/jobs/sync bootstrap)
	@cd $(SERVER_DIR) && go run $(SERVER_CMD)

build-automation: ## Compile the automation daemon binary -> bin/seshat-automation
	@printf "\033[32m[go]\033[0m building %s...\n" $(DAEMON_BIN)
	@mkdir -p $(DAEMON_BIN_DIR)
	@GOBIN=$(DAEMON_BIN_DIR) go install $(DAEMON_PKG)@$(SESHAT_VERSION)
	@mv $(DAEMON_BIN_DIR)/automation-server $(DAEMON_BIN_PATH)
	@printf "\033[32m[go]\033[0m binary ready: %s\n" $(DAEMON_BIN_PATH)

run-automation: ## Run the automation daemon only (reads env / .env)
	@go run $(DAEMON_PKG)@$(SESHAT_VERSION)

# Deploy stack (default: Postgres + seshat-server + seshat-console + Mailpit + SearXNG)
# See deploy/README.md. First run: cp deploy/.env.example deploy/.env and
# fill in POSTGRES_PASSWORD + SESHAT_SERVER_ENCRYPTION_KEY.

deploy-env:
	@if [ ! -f $(DEPLOY_DIR)/.env ]; then \
	  printf "\033[33m[deploy]\033[0m no deploy/.env - copying deploy/.env.example, edit it then re-run.\n"; \
	  cp $(DEPLOY_DIR)/.env.example $(DEPLOY_DIR)/.env; \
	  exit 1; \
	fi

deploy-up: deploy-env ## Build and start the default deploy stack
	@cd $(DEPLOY_DIR) && DEPLOY_DOCLING_URL= docker compose --profile search up --build -d
	@printf "\033[32m[deploy]\033[0m ready: console http://localhost:%s  api http://localhost:%s  searxng http://localhost:%s  mailpit http://localhost:%s\n" \
	  "$${SESHAT_CONSOLE_PORT:-3000}" "$${SESHAT_SERVER_PORT:-8081}" "$${SEARXNG_PORT:-8080}" "$${MAILPIT_WEB_PORT:-8025}"

deploy-up-docs: deploy-env ## Build and start default stack + Docling document conversion
	@cd $(DEPLOY_DIR) && DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile search --profile docs up --build -d
	@printf "\033[32m[deploy]\033[0m docs stack ready: console http://localhost:%s  api http://localhost:%s  searxng http://localhost:%s  docling http://localhost:%s\n" \
	  "$${SESHAT_CONSOLE_PORT:-3000}" "$${SESHAT_SERVER_PORT:-8081}" "$${SEARXNG_PORT:-8080}" "$${DOCLING_PORT:-5001}"

deploy-up-search: deploy-up ## Alias for deploy-up

deploy-up-core: deploy-env ## Build and start only Postgres + server + console + Mailpit
	@cd $(DEPLOY_DIR) && DEPLOY_DOCLING_URL= docker compose up --build -d
	@printf "\033[32m[deploy]\033[0m core ready: console http://localhost:%s  api http://localhost:%s  mailpit http://localhost:%s\n" \
	  "$${SESHAT_CONSOLE_PORT:-3000}" "$${SESHAT_SERVER_PORT:-8081}" "$${MAILPIT_WEB_PORT:-8025}"

deploy-up-s3: deploy-env ## Build and start default stack + MinIO S3 storage testing
	@cd $(DEPLOY_DIR) && DEPLOY_DOCLING_URL= docker compose --profile search --profile s3 up --build -d
	@printf "\033[32m[deploy]\033[0m s3 stack ready: console http://localhost:%s  api http://localhost:%s  searxng http://localhost:%s  minio http://localhost:%s\n" \
	  "$${SESHAT_CONSOLE_PORT:-3000}" "$${SESHAT_SERVER_PORT:-8081}" "$${SEARXNG_PORT:-8080}" "$${MINIO_CONSOLE_PORT:-9001}"

deploy-up-full: deploy-env ## Build and start every deploy service
	@cd $(DEPLOY_DIR) && DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile full up --build -d
	@printf "\033[32m[deploy]\033[0m full stack ready: console http://localhost:%s  api http://localhost:%s  docling http://localhost:%s  searxng http://localhost:%s  minio http://localhost:%s  mailpit http://localhost:%s\n" \
	  "$${SESHAT_CONSOLE_PORT:-3000}" "$${SESHAT_SERVER_PORT:-8081}" "$${DOCLING_PORT:-5001}" "$${SEARXNG_PORT:-8080}" "$${MINIO_CONSOLE_PORT:-9001}" "$${MAILPIT_WEB_PORT:-8025}"

deploy-build: deploy-env ## Build deploy images without starting containers
	@cd $(DEPLOY_DIR) && docker compose --profile full build

deploy-pull: deploy-env ## Pull deploy images, including optional profile services
	@cd $(DEPLOY_DIR) && docker compose --profile full pull

deploy-down: ## Stop the deploy stack (add ARGS=-v to also wipe the Postgres volume)
	@cd $(DEPLOY_DIR) && docker compose down $(ARGS)

deploy-logs: ## Tail logs from every deploy stack container
	@cd $(DEPLOY_DIR) && docker compose logs -f

deploy-ps: ## Show deploy stack container status
	@cd $(DEPLOY_DIR) && docker compose ps

deploy-smoke-core: ## Start core compose stack, check API/console, then clean up
	@bash scripts/smoke-compose-core.sh

# Tests

test: ## Run all Go tests in the workspace
	go test $(GO_PACKAGES)

test-v: ## Run all tests - verbose output
	go test -v $(GO_PACKAGES)

test-race: ## Run all tests with the race detector
	go test -race $(GO_PACKAGES)

test-short: ## Run fast unit tests only (skips DB-backed tests)
	go test -short $(GO_PACKAGES)

test-pkg: ## Run tests for a specific package (PKG=./seshat-backend/internal/scheduler/...)
	go test -v $(PKG)

# Code quality

fmt: ## Format all Go source files with gofmt
	gofmt -w $(shell $(SHELL) -c 'find . -name "*.go" -not -path "./vendor/*"')

vet: ## Run go vet across all Go modules in the workspace
	@mkdir -p $(GO_BUILD_CACHE)
	GOCACHE=$(GO_BUILD_CACHE) go vet $(GO_PACKAGES)

lint: vet ## vet + gofmt check + golangci-lint
	@UNFORMATTED=$$(find . -name "*.go" -not -path "./vendor/*" | xargs gofmt -l); \
	if [ -n "$$UNFORMATTED" ]; then \
	  printf "\033[31m[lint]\033[0m Go files need formatting (run: make fmt):\n%s\n" "$$UNFORMATTED"; \
	  exit 1; \
	fi
	@mkdir -p $(GO_BUILD_CACHE) $(GOLANGCI_CACHE)
	@if command -v golangci-lint >/dev/null 2>&1; then \
	  cd $(BACKEND_DIR) && GOCACHE=$(GO_BUILD_CACHE) GOLANGCI_LINT_CACHE=$(GOLANGCI_CACHE) golangci-lint run --timeout=5m ./...; \
	  cd $(SERVER_DIR) && GOCACHE=$(GO_BUILD_CACHE) GOLANGCI_LINT_CACHE=$(GOLANGCI_CACHE) golangci-lint run --timeout=5m ./...; \
	else \
	  printf "\033[33m[warn]\033[0m golangci-lint not found - install with:\n       go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest\n"; \
	fi

tidy: ## go mod tidy + verify for backend and server modules
	@cd $(BACKEND_DIR) && go mod tidy && go mod verify
	@cd $(SERVER_DIR) && go mod tidy && go mod verify

hooks: ## Install git hooks from .githooks/
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@printf "\033[32m[hooks]\033[0m pre-commit hook installed.\n"

# Frontend surfaces

ui-install: desktop-install ## Alias for desktop-install

ui-build: desktop-build ## Alias for desktop-build

ui-dev: desktop-dev ## Alias for desktop-dev

desktop-install: ## Install desktop Electron dependencies
	@if [ ! -d "$(UI_DIR)/node_modules" ]; then \
	  printf "\033[32m[desktop]\033[0m installing dependencies with %s...\n" $(UI_PKG_MGR); \
	  cd $(UI_DIR) && $(UI_PKG_MGR) install; \
	else \
	  printf "\033[32m[desktop]\033[0m node_modules present - skipping install\n"; \
	fi

desktop-build: desktop-install build ## Build desktop Electron app and local backend
	cd $(UI_DIR) && $(UI_PKG_MGR) run build

desktop-dev: desktop-install ## Start desktop Vite dev server only (no Electron sidecar)
	cd $(UI_DIR) && $(UI_PKG_MGR) run dev

console-install: ## Install admin console dependencies
	@if [ ! -d "$(CONSOLE_DIR)/node_modules" ]; then \
	  printf "\033[32m[console]\033[0m installing dependencies with npm...\n"; \
	  cd $(CONSOLE_DIR) && npm ci; \
	else \
	  printf "\033[32m[console]\033[0m node_modules present - skipping install\n"; \
	fi

console-build: console-install ## Build admin console
	cd $(CONSOLE_DIR) && npm run build

console-dev: console-install ## Start admin console dev server
	cd $(CONSOLE_DIR) && npm run dev

website-install: ## Install website dependencies
	@if [ ! -d "$(WEBSITE_DIR)/node_modules" ]; then \
	  printf "\033[32m[website]\033[0m installing dependencies with npm...\n"; \
	  cd $(WEBSITE_DIR) && npm ci; \
	else \
	  printf "\033[32m[website]\033[0m node_modules present - skipping install\n"; \
	fi

website-build: website-install ## Build marketing/docs website
	cd $(WEBSITE_DIR) && npm run build

website-dev: website-install ## Start website dev server
	cd $(WEBSITE_DIR) && npm run dev

install-all: desktop-install console-install website-install ## Install dependencies for every frontend surface

build-all: build build-server desktop-build console-build website-build ## Build backend, server, desktop, console, and website

# Setup

setup: setup-all ## First-time setup for every local surface

setup-desktop: setup-legacy ## Setup local desktop app surface (system deps + docling + desktop build)

setup-web: console-build website-build ## Setup web surfaces (admin console + website)

setup-all: setup-desktop setup-web ## Setup every local surface

setup-legacy: ## Legacy setup script path (system deps + desktop-only build)
	@bash scripts/setup.sh

# Python / docling (optional feature)
# install-python creates the managed venv and installs docling-serve.
# Called automatically by `make setup`. Use to install or update docling.
#
# Options (env vars):
#   DOCLING_EXTRAS=gpu      -> GPU-accelerated conversion
#   PYTHON_VERSION=3.12     -> specific Python version

install-python: ## Install / update docling-serve in the managed venv
	@bash scripts/install-python-env.sh

# Start docling-serve manually.
# The backend auto-starts it at launch when the venv is installed.
# Use this only to run it as a standalone process.

start-docling: ## Start docling-serve manually (auto-started by the backend)
	@bash scripts/start-docling.sh

# Logs

logs: ## Tail the backend log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf "\033[32m[logs]\033[0m %s\n\n" "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf "\033[33m[logs]\033[0m no log file at %s - start the backend first.\n" "$$LOG"; \
	 fi

logs-last: ## Show the last 200 lines of the backend log
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   tail -200 "$$LOG"; \
	 else \
	   printf "\033[33m[logs]\033[0m no log file at %s.\n" "$$LOG"; \
	 fi

logs-docling: ## Tail the docling-serve log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/nexus}; \
	 LOG="$$RUNTIME_ROOT/logs/docling.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf "\033[32m[logs]\033[0m %s\n\n" "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf "\033[33m[logs]\033[0m no docling log at %s - start the backend first.\n" "$$LOG"; \
	 fi

# Cleanup

clean: ## Remove compiled backend/server binaries and module build artifacts
	rm -f $(BACKEND_BIN_PATH) $(SERVER_BIN_PATH)
	@cd $(BACKEND_DIR) && go clean
	@cd $(SERVER_DIR) && go clean

clean-all: clean ## Remove Go build cache, UI node_modules + dist
	go clean -cache
	rm -rf $(UI_DIR)/node_modules $(UI_DIR)/dist $(UI_DIR)/out
	@printf "\033[32m[clean]\033[0m done.\n"
