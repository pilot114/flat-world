# flat-world: симуляция плоского мира на canvas
# Цели одинаковые во всех проектах ~/projects — см. make help.
.DEFAULT_GOAL := help

.PHONY: help
help: ## эта справка
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

.PHONY: install
install: ## поставить зависимости
	@echo "зависимостей нет"

.PHONY: dev
dev: ## http://localhost:8080
	npm start

.PHONY: build
build: ## сборка
	@echo "сборки нет: статика как есть"

.PHONY: audit
audit: ## уязвимости в зависимостях
	@echo "зависимостей нет"

.PHONY: outdated
outdated: ## устаревшие зависимости
	@echo "зависимостей нет"
