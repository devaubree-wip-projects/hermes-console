.DEFAULT_GOAL := help

HERMES_RUNTIME_URL ?= http://127.0.0.1:9119

.PHONY: help install dev dev-stop dev-fresh dev-next dev-bridge typecheck lint build check \
	db-migrate db-push db-seed-demo db-reset runtime-status runtime-stop

help: ## Afficher cette aide
	@printf '\nHermes Console\n\n'
	@printf 'Développement\n'
	@printf '  make dev              Next.js :3010 + broker + autostart Hermes\n'
	@printf '  make dev-stop         Arrêter la stack locale sur les ports du projet\n'
	@printf '  make dev-fresh        Arrêter la stack, vider le cache puis la relancer\n'
	@printf '  make dev-next         Next.js uniquement\n'
	@printf '  make dev-bridge       Broker et runtime Hermes uniquement\n'
	@printf '  make install          Installer les dépendances avec Bun\n\n'
	@printf 'Qualité\n'
	@printf '  make typecheck        Vérifier les types TypeScript\n'
	@printf '  make lint             Lancer ESLint\n'
	@printf '  make build            Produire le build Next.js\n'
	@printf '  make check            Typecheck, lint puis build\n\n'
	@printf 'Base de données\n'
	@printf '  make db-migrate       Migrer vers le modèle produit\n'
	@printf '  make db-push          Synchroniser le schéma Drizzle\n'
	@printf '  make db-seed-demo     Créer explicitement les données Garage Dupont\n'
	@printf '  make db-reset         Réinitialiser les données (CONFIRM=reset requis)\n\n'
	@printf 'Runtime Hermes\n'
	@printf '  make runtime-status   Vérifier le runtime local\n'
	@printf '  make runtime-stop     Arrêter les processus Hermes serve\n\n'

install: ## Installer les dépendances
	bun install

dev: ## Lancer toute la stack locale
	bun run dev:agent

dev-stop: ## Arrêter les processus qui occupent les ports de la stack locale
	@command -v fuser >/dev/null 2>&1 || { \
		printf 'La commande fuser est requise pour libérer les ports de développement.\n'; \
		exit 1; \
	}
	@repo="$(CURDIR)"; \
	legacy_pids=""; \
	for pid in $$(fuser "3000/tcp" 2>/dev/null || true); do \
		cwd="$$(readlink "/proc/$$pid/cwd" 2>/dev/null || true)"; \
		if [ "$$cwd" = "$$repo" ]; then \
			printf 'Arrêt de l’ancien frontend :3000 (PID :%s)...\n' "$$pid"; \
			kill -TERM "$$pid" 2>/dev/null || true; \
			legacy_pids="$$legacy_pids $$pid"; \
		fi; \
	done; \
	attempt=0; \
	while [ "$$attempt" -lt 20 ]; do \
		busy=0; \
		for pid in $$legacy_pids; do \
			if kill -0 "$$pid" 2>/dev/null; then busy=1; fi; \
		done; \
		[ "$$busy" -eq 0 ] && break; \
		sleep 0.1; \
		attempt=$$((attempt + 1)); \
	done; \
	for pid in $$legacy_pids; do \
		if kill -0 "$$pid" 2>/dev/null; then \
			printf 'Arrêt forcé de l’ancien frontend :3000 (PID :%s)...\n' "$$pid"; \
			kill -KILL "$$pid" 2>/dev/null || true; \
		fi; \
	done
	@ports="3010 8787 9119"; \
	for port in $$ports; do \
		pids="$$(fuser "$$port/tcp" 2>/dev/null || true)"; \
		if [ -n "$$pids" ]; then \
			printf 'Arrêt du port %s (PID :%s)...\n' "$$port" "$$pids"; \
			fuser -k -TERM "$$port/tcp" >/dev/null 2>&1 || true; \
		fi; \
	done; \
	attempt=0; \
	while [ "$$attempt" -lt 20 ]; do \
		busy=0; \
		for port in $$ports; do \
			if fuser "$$port/tcp" >/dev/null 2>&1; then busy=1; fi; \
		done; \
		[ "$$busy" -eq 0 ] && break; \
		sleep 0.1; \
		attempt=$$((attempt + 1)); \
	done; \
	for port in $$ports; do \
		if fuser "$$port/tcp" >/dev/null 2>&1; then \
			printf 'Arrêt forcé du port %s...\n' "$$port"; \
			fuser -k -KILL "$$port/tcp" >/dev/null 2>&1 || true; \
		fi; \
	done

dev-fresh: dev-stop ## Repartir sans processus existant ni cache Next.js
	rm -rf .next
	bun run dev:agent

dev-next: ## Lancer Next.js uniquement
	bun run dev

dev-bridge: ## Lancer le broker avec autostart Hermes
	bun run dev:bridge

typecheck: ## Vérifier TypeScript
	bun run typecheck

lint: ## Lancer ESLint
	bun run lint

build: ## Construire l'application
	bun run build

check: typecheck lint build ## Lancer toutes les validations

db-migrate: ## Appliquer la migration produit
	bun run db:migrate:product

db-push: ## Synchroniser le schéma Drizzle
	bun run db:push

db-seed-demo: ## Créer explicitement les données de démonstration
	bun run db:seed:demo

db-reset: ## Supprimer les comptes, espaces et profils créés par la console
	@test "$(CONFIRM)" = "reset" || { \
		printf 'Commande destructive. Relancez avec: make db-reset CONFIRM=reset\n'; \
		exit 1; \
	}
	bun run db:reset

runtime-status: ## Sonder le runtime Hermes
	@curl --fail --silent --show-error --max-time 2 "$(HERMES_RUNTIME_URL)/api/status" \
		| bun -e 'const s = await Bun.stdin.json(); console.log(`Hermes $${s.version} prêt — $${s.profiles?.length ?? 0} profil(s), $${s.active_sessions ?? 0} session(s) active(s)`);' \
		|| printf 'Runtime Hermes hors ligne sur %s\n' "$(HERMES_RUNTIME_URL)"

runtime-stop: ## Arrêter Hermes manuellement
	hermes serve --stop
