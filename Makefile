# -------------------------------------------------------------------
# obsidian-confluence-page — Development Makefile
#
# Requirements:
#   - bash
#   - bun
#   - git
#
# Release requirements:
#   - git-cliff
#
# Usage examples:
#   make build
#   make install
#   make install OBSIDIAN_VAULT="/path/to/vault"
#   make install OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/confluence-page-publisher"
#
# Release examples:
#   make release
#   make release-patch
#   make release-minor
#   make release-major
#   make release VERSION="1.0.3"
#   make release PUSH=1
#   make release-patch PUSH=1
#   make release-dry-run
#   make release-dry-run BUMP=minor
#   make release ALLOW_DIRTY=1
# -------------------------------------------------------------------

.DEFAULT_GOAL := help

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c

# ---- Colors --------------------------------------------------------
BLUE   := \033[34m
WHITE  := \033[37m
BOLD   := \033[1m
GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m
RESET  := \033[0m

# ---- Project -------------------------------------------------------
PROJECT   ?= $(notdir $(CURDIR))
PLUGIN_ID ?= confluence-page-publisher

# ---- Tools ---------------------------------------------------------
BASH      ?= bash
BUN       ?= bun
GIT       ?= git
GIT_CLIFF ?= git-cliff
INSTALL   ?= install
MKDIR     ?= mkdir -p
RM        ?= rm -rf

# ---- Paths ---------------------------------------------------------
DIST_DIR       ?= dist
RELEASE_SCRIPT ?= scripts/release.sh

OBSIDIAN_VAULT      ?=
OBSIDIAN_PLUGIN_DIR ?= $(if $(OBSIDIAN_VAULT),$(OBSIDIAN_VAULT)/.obsidian/plugins/$(PLUGIN_ID),)

PLUGIN_FILES := \
	$(DIST_DIR)/main.js \
	$(DIST_DIR)/manifest.json \
	$(DIST_DIR)/styles.css

# ---- Release -------------------------------------------------------
# Release modes:
#   auto
#   patch
#   minor
#   major
#
# VERSION overrides the default auto mode:
#   make release VERSION="1.2.3"
#
# Boolean options accept 0 or 1:
#   PUSH=1
#   DRY_RUN=1
#   ALLOW_DIRTY=1
#
# ARGS is an escape hatch for additional release-script arguments.
RELEASE_BASE_ARGS ?= --omit-tag-prefix --sync

BUMP        ?= auto
VERSION     ?=
PUSH        ?= 0
DRY_RUN     ?= 0
ALLOW_DIRTY ?= 0
ARGS        ?=

# -------------------------------------------------------------------
# Internal helpers
# -------------------------------------------------------------------

define print_success
	@echo -e "$(GREEN)OK: $(1)$(RESET)"
endef

define print_warn
	@echo -e "$(YELLOW)WARN: $(1)$(RESET)"
endef

define print_error
	@echo -e "$(RED)ERROR: $(1)$(RESET)"
endef

# -------------------------------------------------------------------
# Help
# -------------------------------------------------------------------

.PHONY: help
help: ## Show this help
	@awk 'BEGIN { \
		FS=":.*##"; \
		printf "\n$(BOLD)$(WHITE)Usage$(RESET): make $(BLUE)<target>$(RESET)\n\n"; \
	} \
	/^##@/ { \
		printf "\n$(BOLD)$(WHITE)%s$(RESET)\n", substr($$0, 5); \
	} \
	/^[a-zA-Z0-9_.-]+:.*##/ { \
		printf "  $(BLUE)%-28s$(RESET) $(WHITE)%s$(RESET)\n", $$1, $$2; \
	}' $(MAKEFILE_LIST); \
	echo ""

# -------------------------------------------------------------------
##@ Dependencies
# -------------------------------------------------------------------

.PHONY: dependency-check
dependency-check: ## Ensure required development tools exist
	@command -v "$(BASH)" >/dev/null 2>&1 || { \
		echo -e "$(RED)ERROR: bash not installed$(RESET)"; \
		exit 1; \
	}
	@command -v "$(BUN)" >/dev/null 2>&1 || { \
		echo -e "$(RED)ERROR: bun not installed$(RESET)"; \
		exit 1; \
	}
	@command -v "$(GIT)" >/dev/null 2>&1 || { \
		echo -e "$(RED)ERROR: git not installed$(RESET)"; \
		exit 1; \
	}
	$(call print_success,development dependencies OK)

.PHONY: release-dependency-check
release-dependency-check: dependency-check ## Ensure release tools exist
	@command -v "$(GIT_CLIFF)" >/dev/null 2>&1 || { \
		echo -e "$(RED)ERROR: git-cliff not installed$(RESET)"; \
		exit 1; \
	}
	@test -f "$(RELEASE_SCRIPT)" || { \
		echo -e "$(RED)ERROR: release script not found: $(RELEASE_SCRIPT)$(RESET)"; \
		exit 1; \
	}
	$(call print_success,release dependencies OK)

# -------------------------------------------------------------------
##@ Development
# -------------------------------------------------------------------

.PHONY: dev
dev: dependency-check ## Start the development build watcher
	$(BUN) run dev

.PHONY: lint
lint: dependency-check ## Run ESLint
	$(BUN) run lint
	$(call print_success,lint passed)

.PHONY: test
test: dependency-check ## Run unit tests
	$(BUN) run test
	$(call print_success,tests passed)

.PHONY: check
check: dependency-check ## Run lint, tests, and production build
	$(BUN) run check
	$(call print_success,all checks passed)

# -------------------------------------------------------------------
##@ Build
# -------------------------------------------------------------------

.PHONY: build
build: dependency-check ## Build the production plugin bundle
	$(BUN) run build
	@for file in $(PLUGIN_FILES); do \
		test -f "$$file" || { \
			echo -e "$(RED)ERROR: expected build output not found: $$file$(RESET)"; \
			exit 1; \
		}; \
	done
	$(call print_success,built $(PROJECT) into $(DIST_DIR))

# -------------------------------------------------------------------
##@ Install
# -------------------------------------------------------------------

.PHONY: install
install: build ## Build and install the plugin into an Obsidian vault
	@expand_home() { \
		case "$$1" in \
			'~') printf '%s\n' "$$HOME" ;; \
			'~/'*) printf '%s/%s\n' "$$HOME" "$${1:2}" ;; \
			*) printf '%s\n' "$$1" ;; \
		esac; \
	}; \
	\
	vault="$(OBSIDIAN_VAULT)"; \
	plugin_dir="$(OBSIDIAN_PLUGIN_DIR)"; \
	\
	vault="$$(expand_home "$$vault")"; \
	plugin_dir="$$(expand_home "$$plugin_dir")"; \
	\
	if [[ -z "$$plugin_dir" ]]; then \
		if [[ -z "$$vault" ]]; then \
			if [[ ! -t 0 ]]; then \
				echo -e "$(RED)ERROR: OBSIDIAN_VAULT is required in a non-interactive environment$(RESET)"; \
				echo -e "$(WHITE)Usage: make install OBSIDIAN_VAULT=\"/path/to/vault\"$(RESET)"; \
				exit 1; \
			fi; \
			\
			read -r -p "Enter OBSIDIAN_VAULT path: " vault; \
			vault="$$(expand_home "$$vault")"; \
		fi; \
		\
		vault="$${vault%/}"; \
		\
		if [[ -z "$$vault" ]]; then \
			echo -e "$(RED)ERROR: OBSIDIAN_VAULT cannot be empty$(RESET)"; \
			exit 1; \
		fi; \
		\
		if [[ ! -d "$$vault" ]]; then \
			echo -e "$(RED)ERROR: Obsidian vault does not exist: $$vault$(RESET)"; \
			exit 1; \
		fi; \
		\
		if [[ ! -d "$$vault/.obsidian" ]]; then \
			echo -e "$(RED)ERROR: directory is not an Obsidian vault: $$vault$(RESET)"; \
			exit 1; \
		fi; \
		\
		plugin_dir="$$vault/.obsidian/plugins/$(PLUGIN_ID)"; \
	else \
		plugin_dir="$${plugin_dir%/}"; \
	fi; \
	\
	echo -e "$(BLUE)Installing plugin into$(RESET): $$plugin_dir"; \
	$(MKDIR) "$$plugin_dir"; \
	$(INSTALL) -m 0644 "$(DIST_DIR)/main.js" "$$plugin_dir/main.js"; \
	$(INSTALL) -m 0644 "$(DIST_DIR)/manifest.json" "$$plugin_dir/manifest.json"; \
	$(INSTALL) -m 0644 "$(DIST_DIR)/styles.css" "$$plugin_dir/styles.css"; \
	echo -e "$(GREEN)OK: installed plugin into $$plugin_dir$(RESET)"

.PHONY: uninstall
uninstall: ## Remove the plugin from an Obsidian vault
	@expand_home() { \
		case "$$1" in \
			'~') printf '%s\n' "$$HOME" ;; \
			'~/'*) printf '%s/%s\n' "$$HOME" "$${1:2}" ;; \
			*) printf '%s\n' "$$1" ;; \
		esac; \
	}; \
	\
	vault="$(OBSIDIAN_VAULT)"; \
	plugin_dir="$(OBSIDIAN_PLUGIN_DIR)"; \
	\
	vault="$$(expand_home "$$vault")"; \
	plugin_dir="$$(expand_home "$$plugin_dir")"; \
	\
	if [[ -z "$$plugin_dir" ]]; then \
		if [[ -z "$$vault" ]]; then \
			if [[ ! -t 0 ]]; then \
				echo -e "$(RED)ERROR: OBSIDIAN_VAULT is required in a non-interactive environment$(RESET)"; \
				echo -e "$(WHITE)Usage: make uninstall OBSIDIAN_VAULT=\"/path/to/vault\"$(RESET)"; \
				exit 1; \
			fi; \
			\
			read -r -p "Enter OBSIDIAN_VAULT path: " vault; \
			vault="$$(expand_home "$$vault")"; \
		fi; \
		\
		vault="$${vault%/}"; \
		\
		if [[ -z "$$vault" ]]; then \
			echo -e "$(RED)ERROR: OBSIDIAN_VAULT cannot be empty$(RESET)"; \
			exit 1; \
		fi; \
		\
		if [[ ! -d "$$vault" ]]; then \
			echo -e "$(RED)ERROR: Obsidian vault does not exist: $$vault$(RESET)"; \
			exit 1; \
		fi; \
		\
		plugin_dir="$$vault/.obsidian/plugins/$(PLUGIN_ID)"; \
	else \
		plugin_dir="$${plugin_dir%/}"; \
	fi; \
	\
	if [[ ! -d "$$plugin_dir" ]]; then \
		echo -e "$(YELLOW)WARN: plugin directory does not exist: $$plugin_dir$(RESET)"; \
		exit 0; \
	fi; \
	\
	$(RM) "$$plugin_dir"; \
	echo -e "$(GREEN)OK: removed plugin from $$plugin_dir$(RESET)"

# -------------------------------------------------------------------
##@ Release
# -------------------------------------------------------------------

.PHONY: release
release: _release ## Create a release using automatic version detection

.PHONY: release-auto
release-auto: override BUMP := auto
release-auto: _release ## Create a release using automatic version detection

.PHONY: release-patch
release-patch: override BUMP := patch
release-patch: _release ## Create a patch release

.PHONY: release-minor
release-minor: override BUMP := minor
release-minor: _release ## Create a minor release

.PHONY: release-major
release-major: override BUMP := major
release-major: _release ## Create a major release

.PHONY: release-dry-run
release-dry-run: override DRY_RUN := 1
release-dry-run: _release ## Preview a release; optionally pass BUMP=patch|minor|major

.PHONY: _release
_release: release-dependency-check
	@set -- $(RELEASE_BASE_ARGS); \
	\
	case "$(PUSH)" in \
		0|1) ;; \
		*) \
			echo -e "$(RED)ERROR: PUSH must be 0 or 1$(RESET)"; \
			exit 1; \
			;; \
	esac; \
	\
	case "$(DRY_RUN)" in \
		0|1) ;; \
		*) \
			echo -e "$(RED)ERROR: DRY_RUN must be 0 or 1$(RESET)"; \
			exit 1; \
			;; \
	esac; \
	\
	case "$(ALLOW_DIRTY)" in \
		0|1) ;; \
		*) \
			echo -e "$(RED)ERROR: ALLOW_DIRTY must be 0 or 1$(RESET)"; \
			exit 1; \
			;; \
	esac; \
	\
	if [[ -n "$(VERSION)" ]]; then \
		if [[ "$(BUMP)" != "auto" ]]; then \
			echo -e "$(RED)ERROR: VERSION cannot be combined with BUMP=$(BUMP)$(RESET)"; \
			exit 1; \
		fi; \
		\
		set -- "$$@" --version "$(VERSION)"; \
		release_mode="version $(VERSION)"; \
	else \
		case "$(BUMP)" in \
			auto) \
				set -- "$$@" --auto; \
				;; \
			patch|minor|major) \
				set -- "$$@" "--$(BUMP)"; \
				;; \
			*) \
				echo -e "$(RED)ERROR: invalid BUMP: $(BUMP)$(RESET)"; \
				echo -e "$(WHITE)Expected: auto, patch, minor, or major$(RESET)"; \
				exit 1; \
				;; \
		esac; \
		\
		release_mode="$(BUMP)"; \
	fi; \
	\
	if [[ "$(ALLOW_DIRTY)" == "1" ]]; then \
		set -- "$$@" --allow-dirty; \
	fi; \
	\
	if [[ "$(DRY_RUN)" == "1" ]]; then \
		set -- "$$@" --dry-run; \
	fi; \
	\
	if [[ "$(PUSH)" == "1" ]]; then \
		set -- "$$@" --push; \
	fi; \
	\
	echo -e "$(BLUE)Release mode$(RESET): $$release_mode"; \
	echo -e "$(BLUE)Dry run$(RESET)     : $(DRY_RUN)"; \
	echo -e "$(BLUE)Push$(RESET)        : $(PUSH)"; \
	echo -e "$(BLUE)Allow dirty$(RESET) : $(ALLOW_DIRTY)"; \
	echo ""; \
	\
	$(BASH) "$(RELEASE_SCRIPT)" "$$@" $(ARGS)
	$(call print_success,release completed)

# -------------------------------------------------------------------
##@ Utilities
# -------------------------------------------------------------------

.PHONY: print-meta
print-meta: ## Print project, installation, and release metadata
	@echo "PROJECT             : $(PROJECT)"
	@echo "PLUGIN_ID           : $(PLUGIN_ID)"
	@echo "DIST_DIR            : $(DIST_DIR)"
	@echo "RELEASE_SCRIPT      : $(RELEASE_SCRIPT)"
	@echo "RELEASE_BASE_ARGS   : $(RELEASE_BASE_ARGS)"
	@echo "BUMP                : $(BUMP)"
	@echo "VERSION             : $(VERSION)"
	@echo "PUSH                : $(PUSH)"
	@echo "DRY_RUN             : $(DRY_RUN)"
	@echo "ALLOW_DIRTY         : $(ALLOW_DIRTY)"
	@echo "OBSIDIAN_VAULT      : $(OBSIDIAN_VAULT)"
	@echo "OBSIDIAN_PLUGIN_DIR : $(OBSIDIAN_PLUGIN_DIR)"

.PHONY: clean
clean: ## Remove generated build artifacts
	$(RM) "$(DIST_DIR)"
	$(call print_success,cleaned generated artifacts)