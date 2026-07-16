# Hermes Console

Cockpit web métier pour piloter une installation locale Hermes : organisations, workspaces, agents, sessions,
tâches, fichiers, connaissances, validations et capacités.

## Architecture

```text
╔══════════════════════════ Produit web ══════════════════════════╗
║ ┌──────────────┐  HTTPS / RBAC  ┌────────────────────────────┐ ║
║ │ Navigateur   │ ──────────────▶ │ Next.js :3010 + PostgreSQL │ ║
║ │ Xulux UI     │ ◀────────────── │ tenants / agents / audit   │ ║
║ └──────┬───────┘  pages / data   └──────────────┬─────────────┘ ║
╚════════│═════════════════════════════════════════│═══════════════╝
         │ WebSocket + ticket signé               │ REST + token local
         ▼                                        ▼
╔══════════════════════ Runtime local Hermes ═════════════════════╗
║ ┌──────────────────┐ JSON-RPC profil forcé ┌─────────────────┐ ║
║ │ Broker Bun :8787 │ ─────────────────────▶ │ hermes serve    │ ║
║ └──────────────────┘ événements isolés      │ :9119 /api/ws   │ ║
║                                             └────────┬────────┘ ║
║                                                      │ profil    ║
║                                ┌─────────────────────▼─────────┐ ║
║                                │ tools / skills / mémoire     │ ║
║                                │ sessions / cron / MCP        │ ║
║                                └───────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════╝
```

Légende : HTTPS transporte les données produit ; REST sert les vues agrégées ; le WebSocket porte le flux
JSON-RPC Hermes. Le broker ne possède aucun agent et ne diffuse aucun événement entre clients.

Composants : Next.js est l’autorité d’auth/RBAC ; PostgreSQL conserve le modèle produit ; un profil Hermes
correspond à un Agent ; Hermes reste l’autorité des conversations et de leur transcript.

## Modèle et routes

```text
Tenant
└── Workspace
    ├── Agent (1 profil Hermes)
    │   └── Sessions (N conversations Hermes)
    ├── Tasks
    ├── Files / Knowledge
    └── Approvals / Audit events
```

La home redirige vers `/:tenantSlug/:workspaceSlug/dashboard`. Les anciennes URLs `/w/:id` sont uniquement
des redirections de migration.

Un compte neuf ne reçoit aucune donnée fictive. Après l'inscription, `/onboarding` collecte l'organisation,
le nom de l'espace et la mission du premier agent, vérifie le runtime Hermes, crée les objets réels puis ouvre
la première conversation. Un compte possédant déjà un workspace est envoyé directement vers son dashboard.

Rôles : `owner`, `member`, `viewer`. Le rôle tenant est hérité par le workspace, avec override ou refus local.
Owners et Members peuvent valider ; seul un Owner peut modifier la configuration technique.

## Démarrage local

Prérequis : Bun, PostgreSQL et Docker avec le plugin Compose.

```bash
bun install
bun run db:migrate:product

# Next.js + Edge Go + Hermes Docker
make dev
```

`make help` affiche toutes les commandes, classées par développement, qualité, base de données et runtime
Hermes. Les scripts restent exécutés exclusivement avec Bun. `make dev` et `make dev-fresh` exposent le
frontend sur `http://localhost:3010`. `make dev-fresh` arrête d'abord la stack, puis supprime uniquement le
cache généré `.next` avant de la relancer.

Les logs restent sur les sorties standard, sont lisibles en développement et structurés en JSON en production.
`make logs`, `make logs-errors` et `make logs-snapshot` couvrent le diagnostic courant ; le contrat de champs,
la corrélation `X-Request-Id`, la redaction et la rétention sont détaillés dans `docs/operations/logging.md`.

En développement, `infra/dev/compose.override.yaml` force `restart: "no"` pour Hermes, l'Edge et le Relay. `Ctrl+C` sur
`make dev` arrête Next.js puis exécute `docker compose down`; `make stop` produit le même état final depuis un
autre terminal. Les volumes de données sont conservés, mais aucun processus ni conteneur de la stack ne reste
actif.

Avant de lancer Next.js, `make dev` partage les mêmes secrets locaux avec l'Edge, crée dans le volume Docker
les profils manquants déjà associés aux agents en base, puis actualise l'état et les capacités des installations
locales. Un workspace existant reste ainsi utilisable après le passage d'un Hermes systemwide à Hermes Docker.

Pour retrouver volontairement une base vide :

```bash
make db-reset CONFIRM=reset
```

Cette commande supprime les comptes, leurs données produit et les profils Hermes associés (sauf `default`).
Les données « Garage Dupont » ne sont plus implicites ; elles ne sont créées qu'avec `make db-seed-demo`.

Variables importantes :

- `DATABASE_URL`
- `HERMES_DEFAULT_GATEWAY_URL` (défaut `http://127.0.0.1:8787`)
- `HERMES_DEFAULT_INSTALLATION_ID` (défaut `local-default`)
- `HERMES_GATEWAY_ENV` (`development` localement, `production` sur tout Edge/Relay déployé)
- `HERMES_GATEWAY_TICKET_SECRET` (tickets navigateur à durée de vie courte)
- `HERMES_GATEWAY_SERVICE_SECRET` (signature des appels serveur Next vers Edge)
- `HERMES_GATEWAY_ALLOWED_HOSTS` (hôtes distants explicitement autorisés à la connexion)
- `HERMES_CONSOLE_URL` (origine HTTPS de la Console utilisée par l’Edge Work Executor ; fournie automatiquement lors de l’enrôlement)
- `HERMES_WORK_ENABLED`, `HERMES_WORK_CAPACITY`, `HERMES_WORK_POLL_INTERVAL_MS` et `HERMES_WORK_ROOT` (activation, concurrence, délai de claim et racine isolée du moteur Travail)
- `WORK_CONTROL_PLANE_ENABLED`, `WORK_EDGE_EXECUTOR_ENABLED`, `WORK_RUN_PLANS_ENABLED`, `WORK_INTERVENTIONS_ENABLED`, `WORK_AUTOMATIONS_ENABLED` et `WORK_AGENT_TEAMS_ENABLED` (rollout produit ; `false` suspend les nouveaux traitements concernés sans supprimer l’historique)
- `HERMES_RUNTIME_TOKEN` (secret interne Edge → dashboard Hermes)
- `HERMES_SESSION_CHANGE_DEBOUNCE_MS` (`200` par défaut)
- `HERMES_SESSION_RECONCILE_MS` (`30000` dans la stack Docker)
- `HERMES_ALLOWED_ORIGINS`

L'Edge Go observe `state.db` et `state.db-wal` une seule fois par profil actif. Une modification déclenche une
invalidation ciblée sur le WebSocket déjà ouvert ; le navigateur recharge alors l'historique canonique. Il n'y
a donc aucun polling périodique de l'API Next par onglet. La réconciliation périodique est désactivée par
défaut ; `HERMES_SESSION_RECONCILE_MS` permet de l'activer explicitement lorsque le stockage ne fournit pas
de notifications filesystem fiables.

Par défaut, `make dev` lance un conteneur Hermes officiel multi-profils et l'Edge Go, puis Next.js. Seul
`127.0.0.1:8787` est publié : le dashboard Hermes reste sur le loopback du namespace réseau partagé et n'est
jamais exposé directement. Les actions start/restart passent par son API de cycle de vie authentifiée, sans
partage du namespace PID et sans socket Docker. `make dev-system` reste disponible pour viser une installation
Hermes systemwide.

Le seul workspace monté par défaut est `./data/workspace` vers `/workspace`, en lecture seule. Pour autoriser un
autre répertoire, définissez explicitement `HERMES_WORKSPACE_DIR`; le passage en écriture exige également
`HERMES_WORKSPACE_READ_ONLY=false`. Aucun répertoire global de l’utilisateur n’est monté implicitement.
Les runs Travail écrivent uniquement dans `HERMES_WORK_DIR` (monté sur `/work`) avec un répertoire par tâche,
un sous-répertoire par run et un manifeste de permissions. L’Edge refuse tout segment invalide ou lien symbolique.

### Import contrôlé d’un Hermes systemwide

`make runtime-import PROFILE=default TARGET_PROFILE=imported-default` copie uniquement les données Hermes
allowlistées de `~/.hermes` vers un **nouveau** profil Docker. L’import est atomique, refuse les liens
symboliques et tout écrasement implicite, exclut les secrets par défaut et écrit un manifeste SHA-256.
Ajoutez `INCLUDE_SECRETS=1` uniquement après revue explicite des credentials. La source systemwide n’est
jamais modifiée ni arrêtée par cette commande.

`make runtime-import-rollback TARGET_PROFILE=imported-default` supprime seulement un profil importé dont
le manifeste et tous les condensats sont encore valides. Une modification post-import bloque donc le rollback
automatique afin de ne pas détruire de nouvelles données.

### Connexion distante via Relay

`make runtime-relay-up` démarre le même binaire Go en mode Relay sur `127.0.0.1:8790` avec TLS 1.3. Dans
la page **Installations**, « Enrôler via Relay » produit un jeton opaque valable dix minutes et affiché une
seule fois. Sur le VPS, la commande `hermes-gateway enroll` génère la clé privée localement, échange le jeton,
puis ouvre un tunnel **sortant** mTLS. Le Relay multiplexe HTTP et WebSocket sans exposer Hermes ni son port
9119. Les credentials sont liés au certificat et au tenant ; les révocations sont persistées et ferment le
tunnel actif.

Pour un Hermes **systemwide** distant, l’Edge reste lui-même sous Docker grâce à
`infra/prod/compose.edge.yaml`. Ce
fichier exige explicitement le chemin Hermes, l’origine Console, le token local du dashboard et l’UID/GID ;
il ne monte aucun home global et garde les données Hermes en lecture seule. Exécutez la commande d’enrôlement
affichée dans la Console avec ce Compose
(`docker compose --project-directory . -f infra/prod/compose.edge.yaml run --rm edge enroll …`), puis
`docker compose --project-directory . -f infra/prod/compose.edge.yaml up -d edge`. La clé privée, le credential Relay et les deux secrets HMAC
dérivés uniquement pour cette installation restent dans `data/edge-identity` en mode `0600`.

Le certificat créé par `make runtime-relay-cert` sert uniquement au développement local. En déploiement,
utilisez un certificat public valide, des secrets aléatoires distincts et un stockage persistant pour
`HERMES_RELAY_REVOCATION_FILE`. Les limites de connexions, de trames et de requêtes empêchent qu’un Edge
sature tous les autres. En mode `production`, le binaire refuse de démarrer avec les secrets de développement
implicites ; Next.js refuse également d’émettre tickets, signatures ou identités sans secrets serveur explicites.

Les sauvegardes managées sont chiffrées AES-GCM, vérifiées avant d’être marquées prêtes, excluent les secrets
par défaut et imposent une sauvegarde de sécurité avant restauration. Un upgrade Docker passe par un exécuteur
de déploiement allowlisté (`HERMES_UPGRADE_EXECUTABLE`) : l’image officielle ne supporte pas `hermes update`
dans le conteneur, donc le contrôle plane doit recréer le conteneur avec une image épinglée puis valider la
version observée. Sans exécuteur déclaré, l’Edge n’annonce jamais la capacité d’upgrade.

### Clé d'inférence Hermes

`hermes-console/.env.local` ne contient pas la clé OpenAI. Le chat `/d/chat` parle au runtime Hermes et l'Edge
force le profil de l'agent à chaque appel. Dans la stack Docker, Hermes charge la clé depuis le volume persistant :

```text
/opt/data/profiles/<nom-du-profil>/.env
```

En mode `make dev-system`, le chemin reste `~/.hermes/profiles/<nom-du-profil>/.env`.

Ajoutez-y sans guillemets :

```dotenv
OPENAI_API_KEY=sk-...
```

Puis configurez le même profil avec le provider OpenAI direct et le modèle voulu :

```bash
hermes -p test-test-assistant-principal model
```

Choisissez `OpenAI API` (`openai-api`) dans l'assistant. La clé seule ne sélectionne pas le provider. Le profil
`default`, lui, lit `~/.hermes/.env`. Aucun fichier ou secret d'un autre projet n'est recherché ou copié.

### Channels Telegram et Discord

La page `Paramètres → Intégrations` configure les channels natifs Hermes agent par agent. Les tokens ne sont
ni stockés en base ni renvoyés au navigateur après sauvegarde : Hermes les écrit dans le `.env` du profil ciblé,
active le channel dans son `config.yaml`, puis redémarre le gateway de ce profil.

Telegram accepte le token fourni par BotFather et une liste optionnelle d'identifiants utilisateurs numériques.
Sans allowlist, un premier message privé déclenche le pairing sécurisé Hermes. Discord nécessite un Bot Token ;
activez également le **Message Content Intent** dans le Developer Portal avant d'inviter le bot sur un serveur.

Quand Telegram est activé, Hermes Console synchronise également l’extension utilisateur
`hermes-console-control` dans le profil et l’active avant de redémarrer le gateway. Cette extension reste
entièrement versionnée dans ce dépôt — aucun fichier de l’installation Hermes Agent n’est modifié. Dans Telegram,
`/model` conserve le picker natif provider/modèle puis demande l’effort compatible avant d’appliquer les deux
choix avec la même portée (`global` par défaut, session courante avec `/model --session`). Pour resynchroniser un
profil manuellement :

```bash
bun run telegram-control:install --profile <profil> --restart
```

N'exposez jamais le dashboard Hermes directement : il peut exécuter des commandes et accéder aux fichiers
autorisés du runtime. L'Edge Go est l'unique frontière publique ; il applique tickets courts, signature HMAC,
RBAC, profils forcés et allowlist de routes. Une installation distante se déclare ensuite depuis
`Infrastructure → Installations`, après ajout explicite de son hôte à `HERMES_GATEWAY_ALLOWED_HOSTS`.

## Validation

```bash
bun run typecheck
bun run lint
bun run build
bun run test
bun run test:gateway
bun run test:e2e
docker compose config --quiet
```

Le chat affiche fidèlement l’erreur Hermes quand aucun provider d’inférence n’est configuré.
