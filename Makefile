# Common tasks. `make help` lists them.
SHELL := bash
.DEFAULT_GOAL := help
PG_CONTAINER ?= ascend-pg

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

db: ## Start local Postgres 17 on :5433 (docker)
	@docker start $(PG_CONTAINER) 2>/dev/null || docker run -d --name $(PG_CONTAINER) -e POSTGRES_USER=ascend -e POSTGRES_PASSWORD=ascend -e POSTGRES_DB=ascend -p 5433:5432 postgres:17-alpine

web: ## Build the SPA into web/dist (embedded by the server at compile time)
	cd web && pnpm install --frozen-lockfile && pnpm build

build: web ## Build the server (debug)
	cargo build -p ascend-api

run: db build ## Build everything and run the server on :8080
	CONTENT_DIR=./content cargo run -p ascend-api

dev: db ## Run API (:8080) and Vite dev server (:5173) with hot reload
	@echo "API: cargo run -p ascend-api   |   Web: cd web && pnpm dev"
	@(CONTENT_DIR=./content cargo run -p ascend-api &) ; cd web && pnpm dev

check: ## Everything CI runs, locally
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	cargo run -q -p ascend-core --example validate_content -- ./content
	python3 scripts/validate_problems.py
	cd web && pnpm typecheck && pnpm test

content: ## Validate curriculum and practice problems
	cargo run -q -p ascend-core --example validate_content -- ./content
	python3 scripts/validate_problems.py
	python3 scripts/shuffle_quiz_options.py --check

quizzes: ## Put quiz options in canonical shuffled order and print answer-bias stats
	python3 scripts/shuffle_quiz_options.py
	python3 scripts/quiz_stats.py

e2e: ## Run Playwright against a running server on :8080 (uses the Playwright docker image)
	docker run --rm --user $$(id -u):$$(id -g) --network host -v $(PWD)/web:/work -w /work -e HOME=/tmp -e BASE_URL=http://localhost:8080 \
	  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test

image: ## Build the production image
	docker build -t ascend:local .

.PHONY: help db web build run dev check content quizzes e2e image
