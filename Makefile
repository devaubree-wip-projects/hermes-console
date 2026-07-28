.DEFAULT_GOAL := help

HERMES_GATEWAY_URL ?= http://127.0.0.1:8787
HERMES_IMAGE_TAG ?= latest
DEV_LOG ?= .next/dev-stack.log
COMPOSE_DEV = HERMES_UID=$(shell id -u) HERMES_GID=$(shell id -g) HERMES_IMAGE_TAG=$(HERMES_IMAGE_TAG) docker compose --project-directory . -f infra/dev/compose.yaml -f infra/dev/compose.override.yaml

.PHONY: help install dev dev-fg stop dev-stop dev-fresh dev-next typecheck lint build check \
	db-migrate db-push db-seed-demo db-reset logs logs-snapshot logs-errors logs-edge logs-hermes runtime-setup runtime-sync-image runtime-up runtime-logs runtime-status runtime-stop runtime-relay-cert runtime-relay-up runtime-relay-logs runtime-backups-maintain test-gateway \
	prod-reset prod-install prod-uninstall prod-status prod-logs prod-db-backup prod-db-restore

help: ## Afficher cette aide
	@printf '\nHermes Console\n\n'
	@printf 'Développement\n'
	@printf '  make dev              Lancer toute la stack en arrière-plan (terminal libéré)\n'
	@printf '  make dev-fg           Lancer la stack au premier plan ; Ctrl+C arrête tout\n'
	@printf '  make stop             Arrêter Next.js, Edge et Hermes\n'
	@printf '  make dev-stop         Alias de make stop\n'
	@printf '  make dev-fresh        Arrêter la stack, vider le cache puis la relancer\n'
	@printf '  make dev-next         Next.js uniquement\n'
	@printf '  make install          Installer le projet (dépendances, .env, base ; INSTALL_ARGS="--seed --with-e2e")\n\n'
	@printf 'Qualité\n'
	@printf '  make typecheck        Vérifier les types TypeScript\n'
	@printf '  make lint             Lancer ESLint\n'
	@printf '  make build            Produire le build Next.js\n'
	@printf '  make check            Typecheck, lint puis build\n\n'
	@printf 'Base de données\n'
	@printf '  make db-migrate       Migrer vers le modèle produit\n'
	@printf '  make db-push          Synchroniser le schéma Drizzle\n'
	@printf '  make db-seed-demo     Créer les comptes owner et member, sans organisation (onboarding à dérouler)\n'
	@printf '  make db-reset         Réinitialiser les données et les profils Hermes (CONFIRM=reset requis)\n\n'
	@printf 'Runtime Hermes\n'
	@printf '  make runtime-sync-image Tirer %s et purger les anciennes images locales\n' "$(HERMES_IMAGE_TAG)"
	@printf '  make runtime-setup    Assistant initial Hermes dans le conteneur\n'
	@printf '  make runtime-up       Démarrer Hermes + Edge Go sous Docker\n'
	@printf '  make runtime-logs     Suivre les logs du runtime local\n'
	@printf '  make runtime-status   Vérifier Edge et Hermes\n'
	@printf '  make runtime-stop     Arrêter le runtime Docker local\n\n'
	@printf 'Logs\n'
	@printf '  make logs             Suivre Edge et Hermes\n'
	@printf '  make logs-snapshot    Afficher les 15 dernières minutes horodatées\n'
	@printf '  make logs-errors      Extraire erreurs, warnings et panics récents\n'
	@printf '  make logs-edge        Suivre uniquement Edge\n'
	@printf '  make logs-hermes      Suivre uniquement Hermes\n\n'
	@printf '  make runtime-relay-up Démarrer le Relay Go TLS local optionnel\n'
	@printf '  make runtime-relay-logs  Suivre les logs du Relay local\n'
	@printf '  make runtime-backups-maintain  Vérifier l’intégrité et appliquer la rétention\n'
	@printf 'Production (infra/prod/)\n'
	@printf '  make prod-install     Installer sur le serveur (PROD_HOST=%s PROD_DOMAIN=%s)\n' "$(PROD_HOST)" "$(PROD_DOMAIN)"
	@printf '                        PROD_SHARED_PROXY=1 si l’hôte a déjà un reverse proxy sur 80/443\n'
	@printf '                        PROD_DEMO_ACCOUNTS=1 pour les comptes de démo (TEST uniquement)\n'
	@printf '  make prod-uninstall   Tout retirer du serveur — destructif (CONFIRM=yes)\n'
	@printf '  make prod-status      Afficher l’état des conteneurs de production\n'
	@printf '  make prod-logs        Suivre les logs de production\n'
	@printf '  make prod-db-backup   Sauvegarder le Postgres de production (pg_dump)\n'
	@printf '  make prod-db-restore  Restaurer une sauvegarde (FILE=nom-du-fichier requis)\n'
	@printf '  make prod-reset       Repartir de zéro — destructif, sauvegarde auto (CONFIRM=reset SEED=1)\n\n'

install: ## Installer le projet (dépendances, .env, base de données)
	./install.sh $(INSTALL_ARGS)

dev: ## Lancer toute la stack en arrière-plan (containers détachés + Next.js) ; terminal libéré
	@mkdir -p .next
	@nohup bun run scripts/dev-stack.ts > $(DEV_LOG) 2>&1 &
	@sleep 2
	@printf 'Stack Hermes Console lancée en arrière-plan.\n  Frontend : http://localhost:3010\n  Logs     : tail -f %s\n  Arrêt    : make stop\n' "$(DEV_LOG)"

dev-fg: ## Lancer la stack au premier plan (Ctrl+C arrête tout proprement)
	bun run scripts/dev-stack.ts

stop: ## Arrêter tous les processus et conteneurs de développement du projet
	bun run scripts/dev-stack.ts --stop

dev-stop: stop ## Alias historique de make stop

dev-fresh: stop ## Repartir sans processus existant ni cache Next.js
	rm -rf .next apps/web/.next apps/web/.next-e2e
	bun run scripts/dev-stack.ts

dev-next: ## Lancer Next.js uniquement
	bun run dev

typecheck: ## Vérifier TypeScript
	bun run typecheck

lint: ## Lancer ESLint
	bun run lint

build: ## Construire l'application
	bun run build

check: typecheck lint build ## Lancer toutes les validations

test-gateway: ## Tester Edge Go avec le détecteur de races
	bun run test:gateway

db-migrate: ## Appliquer la migration produit
	bun run db:migrate:product

db-push: ## Synchroniser le schéma Drizzle
	bun run db:push

db-seed-demo: ## Créer les deux comptes de démonstration (owner et member)
	bun run db:seed:demo

db-reset: ## Supprimer les comptes, espaces et profils Hermes créés par la console
	@test "$(CONFIRM)" = "reset" || { \
		printf 'Commande destructive. Relancez avec: make db-reset CONFIRM=reset\n'; \
		exit 1; \
	}
	@# Un Hermes en marche recrée le dossier du profil juste après sa suppression :
	@# le reset laisserait un profil zombie que le prochain onboarding retrouverait.
	@test -z "$$($(COMPOSE_DEV) ps -q hermes 2>/dev/null)" || { \
		printf 'Le runtime Hermes tourne et recréerait les profils supprimés.\n'; \
		printf 'Arrêtez-le d’abord : make runtime-stop\n'; \
		exit 1; \
	}
	bun run db:reset

prod-reset: ## Remettre une installation conteneurisée à zéro (SEED=1 pour recréer les comptes)
	@test "$(CONFIRM)" = "reset" || { \
		printf 'Commande destructive. Relancez avec: make prod-reset CONFIRM=reset [SEED=1]\n'; \
		exit 1; \
	}
	bash scripts/reset-prod.sh --yes $(if $(SEED),--seed,)

runtime-sync-image: ## Tirer l'image Hermes configurée et purger les anciennes versions locales
	HERMES_IMAGE_TAG=$(HERMES_IMAGE_TAG) bun run scripts/sync-hermes-runtime-image.ts

runtime-setup: ## Configurer le volume Hermes de la stack Docker
	@mkdir -p data/hermes data/workspace data/work data/backups
	$(COMPOSE_DEV) run --rm --no-deps hermes setup

runtime-up: runtime-sync-image ## Démarrer le runtime Docker et Edge Go
	@mkdir -p data/hermes data/workspace data/work data/backups
	$(COMPOSE_DEV) up -d --pull always --force-recreate --no-deps hermes
	$(COMPOSE_DEV) up -d --build --wait edge
	HERMES_IMAGE_TAG=$(HERMES_IMAGE_TAG) bun run scripts/sync-hermes-runtime-image.ts --prune-only

runtime-logs: ## Suivre les logs Hermes et Edge
	$(COMPOSE_DEV) logs -f hermes edge

logs: runtime-logs ## Suivre tous les logs runtime

logs-snapshot: ## Afficher un snapshot horodaté des logs récents
	$(COMPOSE_DEV) logs --since 15m --timestamps --tail 500 hermes edge

logs-errors: ## Extraire les erreurs et avertissements récents sans suivre le flux
	@$(COMPOSE_DEV) logs --since 30m --no-color hermes edge 2>&1 \
		| rg -i 'error|fatal|panic|traceback|warn' \
		|| true

logs-edge: ## Suivre uniquement les logs Edge
	$(COMPOSE_DEV) logs --tail 200 -f edge

logs-hermes: ## Suivre uniquement les logs Hermes
	$(COMPOSE_DEV) logs --tail 200 -f hermes

runtime-status: ## Sonder Edge et son runtime Hermes
	@curl --fail --silent --show-error --max-time 3 "$(HERMES_GATEWAY_URL)/readyz" \
		| bun -e 'const s = await Bun.stdin.json(); console.log(`Edge $${s.ok ? "prêt" : "indisponible"} — installation $${s.installationId ?? "inconnue"}`);' \
		|| { printf 'Edge ou runtime Hermes hors ligne sur %s\n' "$(HERMES_GATEWAY_URL)"; exit 1; }

runtime-stop: ## Arrêter le runtime Docker local
	$(COMPOSE_DEV) down --remove-orphans --timeout 10

runtime-relay-cert: ## Générer le certificat TLS local du Relay (jamais commité)
	@mkdir -p data/relay/certs data/relay/state
	@test -f data/relay/certs/relay.crt -a -f data/relay/certs/relay.key || \
		openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 \
			-keyout data/relay/certs/relay.key -out data/relay/certs/relay.crt \
			-subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
	@chmod 600 data/relay/certs/relay.key data/relay/certs/relay.crt

runtime-relay-up: runtime-relay-cert ## Démarrer le Relay Go local en TLS
	$(COMPOSE_DEV) --profile relay up -d --build --wait relay

runtime-relay-logs: ## Suivre les logs du Relay local
	$(COMPOSE_DEV) --profile relay logs -f relay

runtime-backups-maintain: ## Vérifier périodiquement les backups et appliquer leur rétention
	bun run runtime:maintain-backups

# Cibles de production : aucune valeur par défaut n'est publiée ici. Renseigner
# l'hôte et le domaine à l'appel, ou dans un fichier local non versionné :
#   make prod-status PROD_HOST=root@<ip-ou-hote> PROD_DOMAIN=<domaine>
PROD_HOST ?=
PROD_DOMAIN ?=
PROD_PATH ?= /opt/hermes-console
COMPOSE_PROD = docker compose --project-directory . -f infra/prod/compose.console.yaml -f infra/prod/compose.runtime.yaml

prod-install: ## Installer la Console sur le serveur (PROD_HOST=… PROD_DOMAIN=…)
	@command -v rsync >/dev/null 2>&1 || { printf 'rsync est requis sur cette machine.\n'; exit 1; }
	@printf 'Envoi du dépôt vers %s:%s puis installation de %s\n' "$(PROD_HOST)" "$(PROD_PATH)" "$(PROD_DOMAIN)"
	@ssh $(PROD_HOST) 'mkdir -p $(PROD_PATH)'
	rsync -az --delete \
		--exclude '.git' --exclude 'node_modules' --exclude '.next' \
		--exclude 'data' --exclude 'backups' --exclude '.playwright-cli' \
		--exclude '*.dump' --exclude '*.png' \
		--include '.env.example' --exclude '.env' --exclude '.env.*' \
		./ $(PROD_HOST):$(PROD_PATH)/
	ssh $(PROD_HOST) 'cd $(PROD_PATH) && ./infra/prod/install-server.sh --domain=$(PROD_DOMAIN) $(if $(PROD_ALLOW_IP),--allow-ip=$(PROD_ALLOW_IP),) $(if $(PROD_SHARED_PROXY),--shared-proxy,) $(if $(PROD_DEMO_ACCOUNTS),--demo-accounts,)'

prod-uninstall: ## Retirer entièrement la Console du serveur (destructif — CONFIRM=yes)
	@test "$(CONFIRM)" = yes || { \
		printf 'Destructif : supprime les volumes (base, livrables), le dépôt %s et son .env.\n' "$(PROD_PATH)"; \
		printf 'Relancez avec : make prod-uninstall CONFIRM=yes\n'; \
		exit 1; \
	}
	@printf 'Désinstallation de %s sur %s\n' "$(PROD_PATH)" "$(PROD_HOST)"
	@# Le script part par stdin : il doit survivre à la suppression du dépôt qui le contient.
	ssh $(PROD_HOST) 'bash -s -- --yes --path=$(PROD_PATH) $(if $(PROD_PURGE_RUNTIME_IMAGE),--purge-runtime-image,)' \
		< infra/prod/uninstall-server.sh

prod-status: ## Afficher l'état des conteneurs de production
	ssh $(PROD_HOST) 'cd $(PROD_PATH) && $(COMPOSE_PROD) ps'

prod-logs: ## Suivre les logs de production
	ssh $(PROD_HOST) 'cd $(PROD_PATH) && $(COMPOSE_PROD) logs -f --tail 200'

prod-db-backup: ## Sauvegarder le Postgres de production (voir MEMORY.md §5)
	infra/prod/backup-postgres.sh backup

prod-db-restore: ## Restaurer une sauvegarde de production (FILE=nom-du-fichier requis)
	@test -n "$(FILE)" || { \
		printf 'Fichier requis. Relancez avec: make prod-db-restore FILE=hermes-console-....dump\n'; \
		exit 1; \
	}
	infra/prod/backup-postgres.sh restore "$(FILE)"
