.DEFAULT_GOAL := help

HERMES_GATEWAY_URL ?= http://127.0.0.1:8787
COMPOSE_DEV = HERMES_UID=$(shell id -u) HERMES_GID=$(shell id -g) docker compose -f compose.yaml -f compose.dev.yaml

.PHONY: help install dev stop dev-stop dev-fresh dev-next dev-gateway dev-system typecheck lint build check \
	db-migrate db-push db-seed-demo db-reset runtime-setup runtime-up runtime-logs runtime-status runtime-stop runtime-relay-cert runtime-relay-up runtime-relay-logs runtime-backups-maintain runtime-import runtime-import-rollback test-gateway

help: ## Afficher cette aide
	@printf '\nHermes Console\n\n'
	@printf 'Développement\n'
	@printf '  make dev              Lancer toute la stack ; Ctrl+C arrête tout proprement\n'
	@printf '  make stop             Arrêter Next.js, Edge et Hermes\n'
	@printf '  make dev-stop         Alias de make stop\n'
	@printf '  make dev-fresh        Arrêter la stack, vider le cache puis la relancer\n'
	@printf '  make dev-next         Next.js uniquement\n'
	@printf '  make dev-gateway      Edge Go local vers un Hermes systemwide existant\n'
	@printf '  make dev-system       Next.js + Edge Go vers un Hermes systemwide\n'
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
	@printf '  make runtime-setup    Assistant initial Hermes dans le conteneur\n'
	@printf '  make runtime-up       Démarrer Hermes + Edge Go sous Docker\n'
	@printf '  make runtime-logs     Suivre les logs du runtime local\n'
	@printf '  make runtime-status   Vérifier Edge et Hermes\n'
	@printf '  make runtime-stop     Arrêter le runtime Docker local\n\n'
	@printf '  make runtime-relay-up Démarrer le Relay Go TLS local optionnel\n'
	@printf '  make runtime-relay-logs  Suivre les logs du Relay local\n'
	@printf '  make runtime-backups-maintain  Vérifier l’intégrité et appliquer la rétention\n'
	@printf '  make runtime-import   Importer un profil systemwide sans écrasement\n'
	@printf '  make runtime-import-rollback  Supprimer uniquement un profil importé vérifié\n\n'

install: ## Installer les dépendances
	bun install

dev: ## Lancer toute la stack locale avec cleanup automatique
	bun run scripts/dev-stack.ts

stop: ## Arrêter tous les processus et conteneurs de développement du projet
	bun run scripts/dev-stack.ts --stop

dev-stop: stop ## Alias historique de make stop

dev-fresh: stop ## Repartir sans processus existant ni cache Next.js
	rm -rf .next
	bun run scripts/dev-stack.ts

dev-next: ## Lancer Next.js uniquement
	bun run dev

dev-gateway: ## Lancer Edge Go vers un Hermes systemwide existant
	bun run dev:gateway

dev-system: ## Lancer Next.js et Edge Go vers un Hermes systemwide existant
	bun run dev:agent

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

db-seed-demo: ## Créer explicitement les données de démonstration
	bun run db:seed:demo

db-reset: ## Supprimer les comptes, espaces et profils créés par la console
	@test "$(CONFIRM)" = "reset" || { \
		printf 'Commande destructive. Relancez avec: make db-reset CONFIRM=reset\n'; \
		exit 1; \
	}
	bun run db:reset

runtime-setup: ## Configurer le volume Hermes de la stack Docker
	@mkdir -p data/hermes data/workspace data/backups
	$(COMPOSE_DEV) run --rm --no-deps hermes setup

runtime-up: ## Démarrer le runtime Docker et Edge Go
	@mkdir -p data/hermes data/workspace data/backups
	$(COMPOSE_DEV) up -d --build --wait hermes edge

runtime-logs: ## Suivre les logs Hermes et Edge
	$(COMPOSE_DEV) logs -f hermes edge

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

runtime-import: ## Importer un profil systemwide vers un nouveau profil Docker
	bun run runtime:import-systemwide -- --profile "$(or $(PROFILE),default)" --target-profile "$(or $(TARGET_PROFILE),imported-default)" $(if $(INCLUDE_SECRETS),--include-secrets,) --confirm

runtime-import-rollback: ## Annuler un import contrôlé après vérification du manifeste
	bun run runtime:import-systemwide -- --target-profile "$(or $(TARGET_PROFILE),imported-default)" --rollback --confirm
