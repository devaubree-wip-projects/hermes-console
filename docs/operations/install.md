# Installation de la Console en production

Installation complète d'une Console web hébergée (Next.js + Postgres + TLS) pour un client, dans le modèle
« Console web + Edge Go chez le client ». Ce document ne couvre pas le développement local (`README.md`,
section « Démarrage local »).

## Prérequis

- Un serveur (VPS ou machine dédiée) avec Docker et le plugin Compose.
- Un nom de domaine pointant vers ce serveur (A/AAAA), pour le TLS automatique de Caddy.
- Les ports 80 et 443 accessibles depuis Internet.
- Le dépôt cloné sur le serveur (le service one-shot `migrate` bind-monte le dépôt pour appliquer les
  migrations ; avec un Postgres managé, une machine ayant Bun et l'accès à `DATABASE_URL` suffit).

## 1. Générer les secrets

Copiez `.env.example` vers `.env` à la racine du dépôt, puis remplacez chaque valeur `change-me-…` /
`replace-with-…` par une valeur générée aléatoirement. La liste exhaustive des clés attendues est
`.env.example` — ne lisez ni ne copiez jamais un `.env` réel d'un autre environnement.

```bash
cp .env.example .env
openssl rand -hex 32   # HERMES_GATEWAY_TICKET_SECRET
openssl rand -hex 32   # HERMES_GATEWAY_SERVICE_SECRET
openssl rand -hex 32   # HERMES_RELAY_IDENTITY_SECRET
openssl rand -hex 32   # HERMES_BACKUP_ENCRYPTION_KEY
openssl rand -hex 32   # WORK_AUTOMATION_CRON_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
```

Générez une valeur distincte à chaque commande (ne réutilisez jamais la même chaîne pour deux clés). Complétez
aussi les clés non secrètes propres au déploiement : `POSTGRES_USER`, `POSTGRES_DB`, `HERMES_CONSOLE_DOMAIN`
(le domaine public de la Console), et `HERMES_ALLOWED_ORIGINS` (l'origine HTTPS publique, par exemple
`https://console.exemple.com`). `HERMES_GATEWAY_ENV=production` doit être explicite : le binaire Edge refuse de
démarrer avec des secrets de développement implicites en mode `production`.

Éditez `.env` sur le serveur uniquement ; ne le committez jamais (`.gitignore` l'exclut déjà).

## 2. Provisionner Postgres

Deux options :

- **Compose fourni** (recommandé pour démarrer) : `infra/prod/compose.console.yaml` inclut un service
  `postgres` (`postgres:17-alpine`, volume nommé, healthcheck, aucun port publié). Rien à faire de plus que
  les variables `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` de l'étape 1.
- **Postgres managé** (RDS, Neon, Scaleway…) : ne déployez pas le service `postgres` du compose (retirez-le ou
  ignorez-le) et pointez `DATABASE_URL` du service `web` directement vers l'instance managée dans `.env` ; dans
  ce cas, `infra/prod/backup-postgres.sh` ne s'applique pas — utilisez l'outil de sauvegarde du fournisseur.

## 3. Migrer le schéma

Le service `postgres` du compose ne publie aucun port sur l'hôte : les migrations passent donc par le service
one-shot `migrate` (profil `migrate`), qui rejoint la base sur le réseau interne `console-net` et lit les
migrations versionnées de `apps/web/drizzle` via un bind-mount du dépôt.

```bash
set -a; source .env; set +a
# Démarrer d'abord la base seule, puis appliquer les migrations
docker compose --project-directory . -f infra/prod/compose.console.yaml up -d postgres
docker compose --project-directory . -f infra/prod/compose.console.yaml --profile migrate run --rm migrate
```

Exécutez la migration avant le premier démarrage de `web`, et de nouveau avant chaque mise à jour qui ajoute
une migration (le service `migrate` est idempotent : il n'applique que les migrations non encore enregistrées).

**Postgres managé** (option de l'étape 2) : la base est joignable directement, lancez simplement
`bun install && bun run db:migrate` depuis une machine ayant `DATABASE_URL` en environnement, sans le service
`migrate`.

## 4. Déployer la Console (web + Postgres + Caddy)

```bash
set -a; source .env; set +a
docker compose --project-directory . -f infra/prod/compose.console.yaml up -d --build
docker compose --project-directory . -f infra/prod/compose.console.yaml ps
```

Caddy (`infra/prod/Caddyfile`) obtient et renouvelle automatiquement un certificat TLS public pour
`HERMES_CONSOLE_DOMAIN` dès que le DNS pointe vers le serveur et que les ports 80/443 sont joignables. Le
service `web` n'est jamais exposé directement : seul Caddy publie 80/443, `web` reste sur le réseau interne
`console-net`.

## 5. Créer le premier owner

Ouvrez `https://<HERMES_CONSOLE_DOMAIN>/` et inscrivez le premier compte via le flux d'inscription standard :
il devient automatiquement `owner` de sa première organisation, puis `/onboarding` crée l'agent et la première
conversation réelle (aucune donnée fictive n'est injectée en production).

## 6. Enrôler l'Edge chez le client

L'enrôlement Edge (Hermes systemwide distant sous Docker, via Relay ou connexion directe) est déjà documenté
dans `README.md`, section **« Connexion distante via Relay »** (lignes ~153-175) : jeton d'enrôlement produit
depuis la page Installations de la Console, `infra/prod/compose.edge.yaml`, commande `hermes-gateway enroll`.
Suivez cette section telle quelle — elle n'est pas dupliquée ici pour éviter toute divergence entre les deux
documents.

## 7. Sauvegardes

Voir `docs/operations/backups.md` : `make prod-db-backup`, planification cron, procédure de restauration et de
test de restauration. Mettez en place la sauvegarde quotidienne avant d'ouvrir l'accès aux utilisateurs finaux.

## 8. Vérification post-installation

```bash
curl -fsS https://<HERMES_CONSOLE_DOMAIN>/api/healthz
```

Puis manuellement : connexion avec le compte owner créé à l'étape 5, création d'une tâche de test dans un
projet, et vérification qu'elle apparaît bien dans le tableau de bord et l'audit de l'organisation. Supprimez
la tâche de test une fois la vérification faite.
