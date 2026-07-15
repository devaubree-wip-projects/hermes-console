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

Prérequis : Bun, PostgreSQL et Hermes installé localement.

```bash
bun install
bun run db:migrate:product

# Next.js + broker local ; le broker démarre Hermes si nécessaire
make dev
```

`make help` affiche toutes les commandes, classées par développement, qualité, base de données et runtime
Hermes. Les scripts restent exécutés exclusivement avec Bun. `make dev` et `make dev-fresh` exposent le
frontend sur `http://localhost:3010`. `make dev-fresh` supprime uniquement le cache généré `.next` avant de
relancer la stack.

Pour retrouver volontairement une base vide :

```bash
make db-reset CONFIRM=reset
```

Cette commande supprime les comptes, leurs données produit et les profils Hermes associés (sauf `default`).
Les données « Garage Dupont » ne sont plus implicites ; elles ne sont créées qu'avec `make db-seed-demo`.

Variables importantes :

- `DATABASE_URL`
- `HERMES_RUNTIME_URL` (défaut `http://127.0.0.1:9119`)
- `HERMES_RUNTIME_WS` (défaut `ws://127.0.0.1:9119/api/ws`)
- `HERMES_RUNTIME_AUTOSTART` (`true` par défaut)
- `HERMES_CLI_COMMAND` (`hermes` par défaut)
- `HERMES_SESSION_CHANGE_DEBOUNCE_MS` (`200` par défaut)
- `HERMES_SESSION_RECONCILE_MS` (`0` par défaut ; intervalle opt-in pour un stockage sans watcher fiable)
- `HERMES_DASHBOARD_SESSION_TOKEN` (optionnel en loopback local)
- `HERMES_BRIDGE_SECRET` (même valeur côté Next et broker)
- `HERMES_ALLOWED_ORIGINS`
- `NEXT_PUBLIC_BRIDGE_URL`

Le broker observe `state.db` et `state.db-wal` une seule fois par profil actif. Une modification déclenche une
invalidation ciblée sur le WebSocket déjà ouvert ; le navigateur recharge alors l'historique canonique. Il n'y
a donc aucun polling périodique de l'API Next par onglet. La réconciliation périodique est désactivée par
défaut ; `HERMES_SESSION_RECONCILE_MS` permet de l'activer explicitement lorsque le stockage ne fournit pas
de notifications filesystem fiables.

### Clé d'inférence Hermes

`hermes-console/.env.local` ne contient pas la clé OpenAI. Le chat `/d/chat` parle au runtime Hermes et le
broker force le profil de l'agent à chaque appel. Hermes charge donc la clé depuis le `.env` de ce profil :

```text
~/.hermes/profiles/<nom-du-profil>/.env
```

Pour l'agent local actuel `test-test-assistant-principal`, le chemin exact est :

```text
/home/kev/.hermes/profiles/test-test-assistant-principal/.env
```

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

Le broker doit rester sur loopback. Il réutilise un runtime Hermes déjà actif ; sinon il lance `hermes serve`
et ne stoppe à sa fermeture que ce processus enfant. Le port `8787` empêche plusieurs brokers, et un verrou
de démarrage interne garantit qu’un afflux de clients ne crée qu’un seul runtime.

Ne l’exposez jamais directement : Hermes peut exécuter des commandes et accéder aux fichiers autorisés de la
machine. Pour gérer Hermes manuellement, utilisez `HERMES_RUNTIME_AUTOSTART=false`.

## Validation

```bash
bun run typecheck
bun run lint
bun run build
bun build bridge/agent-bridge.ts --target bun --outfile /tmp/hermes-console-bridge.js
```

Le chat affiche fidèlement l’erreur Hermes quand aucun provider d’inférence n’est configuré.
