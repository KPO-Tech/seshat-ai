# Seshat AI website workspace

WEBSITE_DIR := website
CV_DIR := private/cvs-specialises
PDFLATEX ?= pdflatex
POWERSHELL ?= powershell.exe

.PHONY: help install dev build preview clean cv-build cv-clean-logs identite identite-test identite-serve

.DEFAULT_GOAL := help

help: ## Show available targets
	@$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -Command "Write-Host ''; Write-Host '  Seshat AI - make targets'; Write-Host ''; Get-Content '$(firstword $(MAKEFILE_LIST))' | Select-String '^[a-zA-Z_-]+:.*?## ' | ForEach-Object { $$parts = $$_.Line -split ':.*?## ', 2; '  {0,-16} {1}' -f $$parts[0], $$parts[1] | Write-Host }; Write-Host ''"

install: ## Install website dependencies
	cd $(WEBSITE_DIR) && npm ci

dev: ## Start the website dev server
	cd $(WEBSITE_DIR) && npm run dev

build: ## Build the website
	cd $(WEBSITE_DIR) && npm run build

preview: ## Preview the production build locally
	cd $(WEBSITE_DIR) && npm run preview

identite: ## Regenerate the visual identity kit (SVG logos, preview page, mail signatures)
	cd docs/strategie/identite && python build.py

identite-test: ## Check the identity kit is up to date and matches the hand-drawn originals
	cd docs/strategie/identite && python build.py --check && python -m unittest discover -s tests

identite-serve: ## Serve the identity kit on http://127.0.0.1:8765/apercu/index.html
	cd docs/strategie/identite && python -m http.server 8765 --bind 127.0.0.1

cv-build: ## Build active CV PDFs and remove LaTeX auxiliary logs
	$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'Stop'; $$root = (Resolve-Path '$(CV_DIR)').Path; $$files = Get-ChildItem -LiteralPath $$root -Recurse -Filter '*.tex' | Where-Object { $$_.FullName -notmatch '\\old\\' }; foreach ($$file in $$files) { $$out = Join-Path $$file.Directory.FullName 'output'; New-Item -ItemType Directory -Force -Path $$out | Out-Null; & '$(PDFLATEX)' -interaction=nonstopmode -halt-on-error -output-directory $$out $$file.FullName; if ($$LASTEXITCODE -ne 0) { exit $$LASTEXITCODE } }; $$auxExt = @('.aux','.log','.out','.toc','.fls','.fdb_latexmk','.bbl','.blg','.nav','.snm'); Get-ChildItem -LiteralPath $$root -Recurse -File | Where-Object { $$auxExt -contains $$_.Extension -or $$_.Name -like '*.synctex.gz' } | Remove-Item -Force"

cv-clean-logs: ## Remove LaTeX auxiliary files from CV folders
	$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'Stop'; $$root = (Resolve-Path '$(CV_DIR)').Path; $$auxExt = @('.aux','.log','.out','.toc','.fls','.fdb_latexmk','.bbl','.blg','.nav','.snm'); Get-ChildItem -LiteralPath $$root -Recurse -File | Where-Object { $$auxExt -contains $$_.Extension -or $$_.Name -like '*.synctex.gz' } | Remove-Item -Force"

clean: cv-clean-logs ## Remove generated website build artifacts and LaTeX logs
	$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '$(WEBSITE_DIR)/dist','$(WEBSITE_DIR)/dist-server' -Recurse -Force -ErrorAction SilentlyContinue"
