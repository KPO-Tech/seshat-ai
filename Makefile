# Seshat AI website workspace

WEBSITE_DIR := website

.PHONY: help install dev build preview clean

.DEFAULT_GOAL := help

help: ## Show available targets
	@printf "\n  \033[1mSeshat AI - make targets\033[0m\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@printf "\n"

install: ## Install website dependencies
	cd $(WEBSITE_DIR) && npm ci

dev: ## Start the website dev server
	cd $(WEBSITE_DIR) && npm run dev

build: ## Build the website
	cd $(WEBSITE_DIR) && npm run build

preview: ## Preview the production build locally
	cd $(WEBSITE_DIR) && npm run preview

clean: ## Remove generated website build artifacts
	rm -rf $(WEBSITE_DIR)/dist $(WEBSITE_DIR)/dist-server
