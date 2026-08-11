# ===========================================================================
# FORGE — hybrid training log
#
#   make            list every target
#   make setup      one-time setup on a fresh clone
#   make dev        run the whole stack locally (app + Firebase emulator)
# ===========================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE      := docker compose
ENV_FILE     := .env.local
ENV_TEMPLATE := .env.example
EMULATOR_DIR := .emulator-data

.PHONY: help
help: ## Show this help
	@echo ""
	@echo "  FORGE — available targets"
	@echo ""
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

.PHONY: setup
setup: $(ENV_FILE) install ## First-time setup: env file + dependencies
	@mkdir -p $(EMULATOR_DIR)
	@echo ""
	@echo "✓ Setup complete. Next: make dev  →  http://localhost:3000"
	@echo ""

$(ENV_FILE):
	@cp $(ENV_TEMPLATE) $(ENV_FILE)
	@echo "✓ Created $(ENV_FILE) from $(ENV_TEMPLATE)"
	@echo "  Local development works as-is against the emulator."
	@echo "  Fill in real Firebase values only to point at a live project."

# `npm ci`, not `npm install`. This target only mirrors the lockfile onto the host
# for the editor, so it has no business rewriting it — and on macOS a bare
# `npm install` prunes the hoisted entries only Linux resolution needs (@emnapi/*,
# for @img/sharp-wasm32), which then breaks `npm ci` in the container. `make setup`
# used to corrupt its own build that way.
#
# Adding or removing a package stays an explicit `npm install <pkg>` — see
# "Changing dependencies" in the README.
.PHONY: install
install: ## Install npm dependencies on the host (for editor/IDE support)
	npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Local development
# ---------------------------------------------------------------------------

.PHONY: dev
dev: $(ENV_FILE) ## Start app + Firebase emulator (foreground, Ctrl-C to stop)
	@mkdir -p $(EMULATOR_DIR)
	@echo "→ app          http://localhost:3000"
	@echo "→ emulator UI  http://localhost:4000"
	$(COMPOSE) up --build

.PHONY: up
up: $(ENV_FILE) ## Same as dev, but detached
	@mkdir -p $(EMULATOR_DIR)
	$(COMPOSE) up --build -d
	@echo "✓ Running. App: http://localhost:3000 · Emulator UI: http://localhost:4000"

.PHONY: down
down: ## Stop the stack (emulator exports its data first)
	$(COMPOSE) down

.PHONY: restart
restart: down up ## Restart the stack

.PHONY: emulator
emulator: ## Start only the Firebase emulator (for `npm run dev` on the host)
	@mkdir -p $(EMULATOR_DIR)
	$(COMPOSE) up --build emulator

.PHONY: logs
logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=100

.PHONY: logs-web
logs-web: ## Tail logs from the web service only
	$(COMPOSE) logs -f --tail=100 web

.PHONY: shell
shell: ## Open a shell inside the running web container
	$(COMPOSE) exec web bash

# ---------------------------------------------------------------------------
# Quality gates — identical to what CI runs
# ---------------------------------------------------------------------------

.PHONY: check
check: typecheck lint build test ## Run every CI gate locally

.PHONY: test
test: test-offline test-percentages test-rules test-sw ## Run all tests

.PHONY: test-offline
test-offline: ## Offline write-acceptance and cache-fallback tests
	npm run test:offline

.PHONY: test-percentages
test-percentages: ## Percentage-of-max table arithmetic
	npm run test:percentages

.PHONY: test-rules
test-rules: ## Firestore security-rules tests (starts the emulator if needed)
	@mkdir -p $(EMULATOR_DIR)
	$(COMPOSE) up -d --wait emulator
	@echo "→ running rules tests against an isolated project; your local data is untouched"
	node --test tests/firestore.rules.test.mjs

.PHONY: test-sw
test-sw: ## Service-worker offline-routing tests (requires a build)
	@test -f out/sw.js || $(MAKE) build
	npm run test:sw

.PHONY: typecheck
typecheck: ## TypeScript, no emit
	npm run typecheck

.PHONY: lint
lint: ## ESLint
	npm run lint

.PHONY: build
build: ## Production build (static export into out/)
	npm run build

.PHONY: preview
preview: build ## Serve the built site through the Firebase Hosting emulator
	@echo "→ preview http://localhost:5050  (real hosting config: cleanUrls, headers, 404)"
	$(COMPOSE) --profile preview up --build preview

# ---------------------------------------------------------------------------
# Firebase
# ---------------------------------------------------------------------------

.PHONY: firebase-login
firebase-login: ## Authenticate the Firebase CLI (writes a token to your home dir)
	npx --yes firebase-tools@13 login

.PHONY: firebase-link
firebase-link: ## Point this checkout at a real project: make firebase-link PROJECT_ID=my-project
	@test -n "$(PROJECT_ID)" || { \
		echo "Usage: make firebase-link PROJECT_ID=your-firebase-project-id"; exit 1; }
	node scripts/link-firebase.mjs $(PROJECT_ID)

# --- GitHub configuration -------------------------------------------------
# Reads the values `make firebase-link` produced, so GitHub cannot end up holding
# a different config from the one this checkout builds with.

.PHONY: gh-config
gh-config: ## Set the six GitHub Actions variables from .env.production.local
	@test -f .env.production.local || { \
		echo "Run 'make firebase-link PROJECT_ID=…' first."; exit 1; }
	@set -eu; \
	project=$$(node -e "console.log(require('./.firebaserc').projects.default)"); \
	echo "→ setting variables on $$(gh repo view --json nameWithOwner -q .nameWithOwner)"; \
	gh variable set FIREBASE_PROJECT_ID --body "$$project"; \
	for key in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
	           NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
	           NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID; do \
	  value=$$(grep "^$$key=" .env.production.local | cut -d= -f2-); \
	  test -n "$$value" || { echo "missing $$key in .env.production.local"; exit 1; }; \
	  gh variable set "$$key" --body "$$value"; \
	done; \
	echo "✓ variables set"; \
	gh variable list

.PHONY: gh-secret
gh-secret: ## Store the service-account key: make gh-secret KEY=path/to/key.json
	@test -n "$(KEY)" || { echo "Usage: make gh-secret KEY=path/to/service-account.json"; exit 1; }
	@test -f "$(KEY)" || { echo "No such file: $(KEY)"; exit 1; }
	@node -e "JSON.parse(require('fs').readFileSync('$(KEY)','utf8')).private_key || (console.error('$(KEY)' + ' is not a service-account key (no private_key field).'), process.exit(1))"
	gh secret set FIREBASE_SERVICE_ACCOUNT < "$(KEY)"
	@echo "✓ FIREBASE_SERVICE_ACCOUNT set. Delete your local copy of the key now:"
	@echo "    rm $(KEY)"

.PHONY: rules-deploy
rules-deploy: ## Deploy Firestore rules + indexes to the default project
	npx --yes firebase-tools@13 deploy --only firestore:rules,firestore:indexes

.PHONY: deploy
deploy: build ## Manually deploy hosting + rules (CI does this on merge to main)
	@echo "→ deploying to Firebase Hosting"
	@echo "  NOTE: this uploads the out/ you just built, which used your local"
	@echo "        .env.local. CI builds with the repository variables instead."
	npx --yes firebase-tools@13 deploy \
		--only hosting,firestore:rules,firestore:indexes

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build artefacts and containers (keeps emulator data)
	$(COMPOSE) down --remove-orphans
	rm -rf .next out

.PHONY: reset-emulator
reset-emulator: ## Delete all local Auth users and Firestore documents
	@printf "This deletes every local user and workout in $(EMULATOR_DIR). Continue? [y/N] " \
		&& read ans && [ "$${ans:-N}" = "y" ]
	$(COMPOSE) down
	rm -rf $(EMULATOR_DIR)
	@mkdir -p $(EMULATOR_DIR)
	@echo "✓ Emulator data reset"

.PHONY: nuke
nuke: ## Remove containers, volumes, node_modules and build output
	@printf "This removes containers, volumes and node_modules. Continue? [y/N] " \
		&& read ans && [ "$${ans:-N}" = "y" ]
	$(COMPOSE) down -v --remove-orphans
	rm -rf node_modules .next out
	@echo "✓ Clean slate. Run: make setup"
