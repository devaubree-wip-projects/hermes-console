# Infrastructure

- `dev/` contient la stack Docker Compose locale Hermes + Edge + Relay, son override sans redémarrage et son
  couple `gateway.Dockerfile` / `gateway.Dockerfile.dockerignore`.
- `prod/` contient le Compose Edge destiné à connecter une installation Hermes systemwide distante et son
  propre couple Dockerfile/ignore, qui exclut les tests du contexte de production.
- `prod/compose.console.yaml` déploie la Console elle-même chez le client : services `web` (image
  `apps/web/Dockerfile`), `postgres` (sans port publié) et `caddy` (TLS automatique via `prod/Caddyfile`).
  L'image web a son propre couple `apps/web/Dockerfile` / `apps/web/Dockerfile.dockerignore` (allowlist
  distincte de celle du gateway) car le contexte de build reste la racine du monorepo pour les workspaces Bun.
  Sauvegarde/restauration Postgres : `prod/backup-postgres.sh` (voir `docs/operations/backups.md`).
  Installation complète : `docs/operations/install.md`.

Les fichiers sont déplacés hors de la racine, mais leurs chemins relatifs continuent de partir de la racine du
dépôt grâce à `docker compose --project-directory .`. Les commandes habituelles restent `make dev`,
`make runtime-up` et les autres cibles du `Makefile`.
