# Junie Guide Makefile — quick commands for common tasks in this repo
# Usage examples:
#   make help
#   make install dev
#   make dev-local
#   make build-prod preview

SHELL := /bin/bash
PNPM  := pnpm

.PHONY: help install prepare dev dev-local build build-dev build-stage build-prod build-local preview lint lint-fix format format-fix typecheck test test-watch update-sdk clean

help:
	@echo "Available targets:"
	@echo "  install       - Install dependencies (pnpm install)"
	@echo "  prepare       - Setup git hooks with Husky (pnpm prepare)"
	@echo "  dev           - Start Vite dev server"
	@echo "  dev-local     - Start Vite dev server in Local Studio mode"
	@echo "  build         - Type-check and build for production"
	@echo "  build-dev     - Build using --mode dev"
	@echo "  build-stage   - Build using --mode stage"
	@echo "  build-prod    - Build using --mode prod"
	@echo "  build-local   - Build using --mode localstudio"
	@echo "  preview       - Preview the built app from web/"
	@echo "  lint          - Run code linter to check files"
	@echo "  lint-fix      - Run code linter and automatically apply fixes, where possible"
	@echo "  format        - Check formatting of code"
	@echo "  format-fix    - Fix formatting of code automatically"
	@echo "  typecheck     - Run TypeScript project references build (type-check)"
	@echo "  test          - Run tests once (Vitest)"
	@echo "  test-watch    - Run tests in watch mode"
	@echo "  update-sdk    - Fetch OpenAPI and regenerate API types"
	@echo "  clean         - Remove node_modules, web, and dist"

install:
	$(PNPM) install

prepare:
	$(PNPM) prepare

dev:
	$(PNPM) dev

dev-local:
	$(PNPM) dev:local

build:
	$(PNPM) build

build-dev:
	$(PNPM) build:dev

build-stage:
	$(PNPM) build:stage

build-prod:
	$(PNPM) build:prod

build-local:
	$(PNPM) build:local

preview:
	$(PNPM) preview

lint:
	$(PNPM) lint

lint-fix:
	$(PNPM) lint:fix

format:
	$(PNPM) format

format-fix:
	$(PNPM) format:fix

typecheck:
	$(PNPM) exec tsc -b

test:
	$(PNPM) test

test-watch:
	$(PNPM) test:watch

update-sdk:
	$(PNPM) update-sdk

clean:
	rm -rf node_modules web dist
