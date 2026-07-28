# MEMORY — Hermes Console

> **La vérité durable du projet.** Ce que le produit est, comment il est bâti, où il en est, ce qui a été
> décidé. Les écarts encore ouverts sont signalés comme tels dans les sections concernées.
>
> Dernière vérification contre le code : **24 juillet 2026**, commit `c19127e`.
> Les affirmations d'état portent leur ancrage (`fichier:ligne` ou commande) pour rester ré-auditables.

**Sommaire** — [1. Produit](#1-produit) · [2. Architecture](#2-architecture) ·
[3. Données et surface](#3-données-et-surface) · [4. État mesuré](#4-état-mesuré-au-24-juillet-2026) ·
[5. Exploitation](#5-exploitation) · [6. Journal des décisions](#6-journal-des-décisions) ·
[7. Ne pas casser](#7-ne-pas-casser)

---

## 1. Produit

### Ce que c'est

Hermes Console est **l'autorité produit et de contrôle autour du runtime Hermes**. Il transforme des
conversations et des automatisations en **travail durable, attribué, observable et récupérable**, tout en
conservant Hermes comme moteur agentique unique.

Le succès se mesure à une exécution de bout en bout traçable, depuis la demande métier jusqu'au livrable,
**sans dépendance au cycle de vie d'un onglet**.

### La promesse

> **La meilleure interface du marché pour construire et piloter des agents Hermes** — utilisable par un
> développeur comme par quelqu'un qui n'en est pas un.

Quatre engagements en découlent, et ils priment sur toute fonctionnalité ajoutée :

| | Engagement | Ce que ça implique |
|---|---|---|
| 🎯 | **S'en emparer sans être développeur** | Créer un agent, lui donner des skills et des outils, le lancer — sans ligne de commande, sans fichier à éditer, sans connaître Hermes |
| 🔌 | **Distant ou local, au choix** | La même Console pilote un runtime sur la machine de l'utilisateur ou un runtime distant, via un tunnel sortant. Le mode se choisit, il ne se subit pas |
| 🔄 | **Jamais en retard sur Hermes** | La Console suit `latest` ; quand une version sort, elle le **signale** et l'utilisateur **décide** quand l'appliquer |
| 💬 | **Piloter depuis là où on est** | Orchestrer un ou plusieurs agents depuis Telegram **et** Discord, à parité, pas seulement depuis le navigateur |

> ⚠️ **« TUI » désigne la Console elle-même** dans le vocabulaire du projet — l'interface web Next.js. Il n'y
> a aucune interface terminal à construire ici. La seule TUI de l'écosystème appartient à Hermes Agent
> (`ui-tui/`, `@hermes/ink`) et n'est pas dans le périmètre de ce dépôt. *(Décision D-E, §6.)*

### Pour qui

Des `owner`, `member` et `viewer` qui **construisent** des agents et organisent leur travail dans une
organisation. Ils créent des tâches, les assignent à des humains, des agents ou des équipes, suivent les
plans d'exécution, interviennent sur les actions sensibles et auditent les résultats. L'interface doit
rester exploitable pendant une activité longue, y compris navigateur fermé.

**Le non-développeur est un utilisateur de premier rang, pas un cas dégradé.** Toute fonctionnalité qui
exige un terminal, un fichier de configuration ou une connaissance du runtime Hermes pour être utilisée est
une fonctionnalité inachevée.

### Voix

Précise, calme, responsable. Directe et opérationnelle. Elle expose les états réels, les responsabilités et
les décisions **sans dramatiser ni masquer la complexité utile**.

### Anti-références

- Les interfaces de chat qui font passer une conversation ouverte pour une file de tâches durable.
- Les dashboards SaaS décoratifs remplis de métriques sans action ni provenance.
- Les interfaces agentiques qui cachent le plan, les permissions, les demandes sensibles ou l'auteur d'une décision.
- Les clones visuels de Multica ou Sinew : leurs principes de collaboration sont adaptés au modèle Hermes
  Console, leur identité n'est pas reproduite.

### Les 5 principes de design

1. **Montrer l'état canonique** : tâche, run, plan, intervention et livrable restent des objets distincts.
2. **Garder l'humain responsable** : l'assignation, l'initiateur et les décisions sensibles sont toujours visibles.
3. **Rendre les travaux longs récupérables** : aucun écran ne suppose qu'un onglet reste ouvert.
4. **Réduire le bruit sans perdre l'audit** : résumer la progression, conserver la timeline et les révisions complètes.
5. **Préférer les affordances familières** : listes, statuts, checklists, filtres et actions explicites servent le travail.

### Accessibilité

Cible **WCAG 2.2 AA**. Tout au clavier, focus visibles, libellés explicites, états jamais portés par la seule
couleur, `prefers-reduced-motion` respecté. Le board doit offrir une alternative clavier au glisser-déposer,
et les changements temps réel doivent rester compréhensibles par les technologies d'assistance.

---

## 2. Architecture

### Topologie

```text
╔══════════════════ apps/web — Next.js (autorité produit) ══════════════════╗
║ auth · RBAC · tenants · 85 routes · 45 tables · audit                      ║
║ Reste seul maître de l'identité, de l'autorisation et de la persistance    ║
╚═══════════════════════════════╤═══════════════════════════════════════════╝
                                │ HTTP signé (HMAC + nonce + fenêtre 30 s)
                                ▼
╔══════════════════ apps/gateway — Go (Edge / Relay) ═══════════════════════╗
║ application du protocole · proxy runtime · relay · cycle de vie · events   ║
║ N'est JAMAIS le produit ni l'autorité RBAC                                 ║
╚═══════════════════════════════╤═══════════════════════════════════════════╝
                                │ HTTP + WebSocket Hermes authentifiés
                                ▼
┌───────────── Runtime Hermes (Docker ou systemwide) ───────────────────────┐
│ 1 profil Hermes = 1 Agent · BYOK · skills · sessions · cron · MCP         │
└───────────────────────────────────────────────────────────────────────────┘

╔══════════════════ packages/shared ════════════════════════════════════════╗
║ contrat de passerelle neutre : TypeScript ET Go (gateway.json pivot)       ║
║ DTO, erreurs, constantes · aucun comportement métier                       ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

Les flèches descendantes sont du flux de contrôle/données runtime authentifié. `packages/shared` est importé
à la compilation par les deux côtés.

### Couches web (hexagonal)

```text
presentation  src/app — routes + UI
      │ DTO commande/requête validé
      ▼
application   src/modules/*/application — use-cases et ports
      │ modèles de domaine + appels de port
      ▼
domain        src/modules/*/domain — politiques, erreurs, types valeur
      ▲ implémentation de port
      │
infrastructure src/modules/*/infrastructure — DB, gateway, télémétrie
```

Slices existants : **`auth`, `agents`, `installations`, `work`**. Aucun nouveau domaine métier ne doit être
créé uniquement pour héberger des helpers techniques.

### Les 6 règles d'import

1. Un handler de `src/app` valide l'entrée transport, invoque **un** use-case et mappe le résultat vers le
   contrat de réponse public inchangé.
2. La présentation peut importer l'application et les contrats partagés. Elle ne fait **pas** de requête
   Drizzle ni d'appel Hermes/Gateway direct pour une slice migrée.
3. L'application importe son domaine et ses ports déclarés. Jamais Next.js, React, ni un adaptateur concret.
4. Le domaine est sans framework. Types stables de `@hermes-console/shared` autorisés ; Next.js, Drizzle et
   l'infrastructure interdits.
5. L'infrastructure implémente les ports et peut importer Drizzle, les clients Hermes et la télémétrie.
   Elle n'importe **pas** la présentation.
6. L'accès inter-slice passe par une API applicative exportée ou un contrat partagé, **jamais** par
   l'infrastructure interne d'une autre slice.

### Invariants d'outillage

- **Bun** est l'unique entrypoint JS (packages, scripts, build) ; `bunx` pour les exécutables.
- Les scripts racine restent des alias de compatibilité des commandes historiques.
- **Go** reste la chaîne native derrière les scripts Bun du gateway.
- Audit d'architecture : `bun run audit:architecture` ; vérification : `bun run contracts:verify`.

### Contrats gelés — procédure de modification délibérée

`docs/audit/contract-baseline.json` fige **les 85 routes publiques et le hash de `schema.ts`**. Toute dérive
accidentelle fait échouer la CI. Un changement **voulu** se re-baseline ainsi :

1. Faire le changement de route/schéma ; pour un schéma : `bun run db:generate`.
2. Régénérer l'instantané : `bun run audit:architecture` (écrit `contracts-current.json`).
3. Relire le diff `contract-baseline.json` ↔ `contracts-current.json` — **chaque entrée doit être voulue**.
4. Adopter l'instantané : copier `contracts-current.json` sur `contract-baseline.json`.
5. Confirmer `bun run contracts:verify`, puis **commiter la baseline avec le code**, pour que le diff
   documente l'évolution du contrat.

---

## 3. Données et surface

### Modèle

```text
Tenant (organisation + frontière RBAC)
├── Members (owner / member / viewer)   ← rôles tenant-only
├── Agent (= 1 profil Hermes)
│   └── Sessions (N conversations Hermes)
├── Work items / Projects / Automations / Agent teams
├── Files / Knowledge / Resources
└── Approvals / Audit events / Inbox
```

**45 tables**, `apps/web/src/db/schema.ts` (1 524 lignes).

### ⚠️ Le doublon `workspace` / `tenant`

Fait structurant, à connaître avant de toucher au schéma :

- Les deux tables coexistent : `tenants` (`schema.ts:60`) et `workspaces` (`schema.ts:72`), avec deux tables
  d'appartenance (`tenantMemberships`, `workspaceMemberships`).
- **`schema.ts:88` pose `uniqueIndex("workspaces_tenant_uidx").on(tenantId)`** → il ne peut exister qu'**un
  seul workspace par tenant**. `workspace` n'est donc pas un niveau hiérarchique : c'est un **alias 1:1 de
  `tenant`**, et le mapping `workspaces.id → workspaces.tenant_id` est bijectif.
- Répartition réelle : **21 tables portent `workspaceId`** (dont tout le module Travail, `agents`, `projects`,
  `files`, `approvals`, `auditEvents`) contre **5 sur `tenantId`**.
- `auditEvents` porte **les deux** — `tenant_id` y est déjà `notNull` (`schema.ts:1406`).
- **29 routes sur 85 (34 %)** vivent hors de `/:tenantSlug` (`/tasks`, `/workspaces`, `/approvals/:id`,
  `/files`, `/runtime/**`, `/auth/**`).

Un second doublon se superpose : **`tasks` (legacy) vs `work_items` (actuel)**. `approvals` (`schema.ts:1374`)
pointe encore sur `tasks` et n'a **ni `tenantId` ni `workItemId`** — c'est la raison pour laquelle
`components/approvals/approval-actions.tsx` est du code mort : la table ne sait pas parler au modèle de
travail actuel.

➡️ La suppression de ce doublon est actée (voir [§6, D-B](#6-journal-des-décisions)) et reste ouverte.

### Routage

La home redirige vers `/:tenantSlug/dashboard`. Pages produit et APIs publiques utilisent `/:tenantSlug/**`
et `/api/:tenantSlug/**`. Une réécriture interne (`lib/tenant-routing.ts`) maintient la compatibilité avec
l'ancien arbre à deux segments pendant la migration.

Un compte neuf ne reçoit **aucune donnée fictive** : `/onboarding` collecte l'organisation, la mission du
premier agent, vérifie le runtime, crée les objets réels puis ouvre le dashboard de l'organisation.

### Rôles

`owner` administre les membres, les agents et Hermes · `member` crée/modifie le travail et répond aux
validations · `viewer` consulte toute l'organisation en lecture seule.

### Contrat métier Travail — état actuel (compatibilité v1 + vérité de livraison J1)

Les statuts persistés gardent encore les libellés v1 (`modules/work/domain/work.ts:7`) :
`backlog · todo · in_progress · blocked · review · done · cancelled`

Statuts d'un run : `queued · preparing · running · waiting_input · cancelling · succeeded · failed · cancelled`

La vérité de livraison J1 est bien active : `work-runtime-service.ts` appelle `resolveDeliveryOutcome`,
vérifie résumé, commentaires et ressources issus du run, puis bloque un succès technique sans livrable.
La lecture ajoute aussi `executionState`, dérivé des runs actifs, sans utiliser la colonne kanban pour
prétendre que Hermes travaille.

> ⚠️ **Migration de vocabulaire encore ouverte :** la base et les transitions
> persistées n'ont pas encore adopté les noms cibles
> `ready · active · in_review` ni une colonne `delivery_state` distincte. Les garde-fous métier sont livrés ;
> l'unification explicite du schéma et la compatibilité d'affichage restent à terminer.

### Canaux d'orchestration — état mesuré

L'engagement est la **parité Telegram / Discord** (D-F). L'état réel est asymétrique :

| | Configuration du channel | Orchestration du travail |
|---|---|---|
| **Telegram** | ✅ `messaging-integrations-panel.tsx` | ✅ `/work <brief>` via l'extension `hermes-console-control`, `telegram-work-ingress.ts`, notifications d'intervention (`intervention-notification.ts`) |
| **Discord** | ✅ panneau + `discord-setup-guide-dialog.tsx` | ❌ **rien** — aucun ingress, aucune notification, aucune réponse d'approbation |

Les tokens ne sont **ni stockés en base ni renvoyés au navigateur** : Hermes les écrit dans le `.env` du
profil ciblé, active le channel dans son `config.yaml`, puis redémarre le gateway du profil. Discord exige en
plus le *Message Content Intent*.

➡️ La parité reste ouverte.

### Drapeaux de fonctionnalité

`modules/work/domain/work-flags.ts` — actifs par défaut, `false` suspend les nouveaux traitements **sans
supprimer l'historique** :
`WORK_CONTROL_PLANE_ENABLED` · `WORK_EDGE_EXECUTOR_ENABLED` · `WORK_RUN_PLANS_ENABLED` ·
`WORK_INTERVENTIONS_ENABLED` · `WORK_AUTOMATIONS_ENABLED` · `WORK_AGENT_TEAMS_ENABLED`

---

## 4. État mesuré au 24 juillet 2026

### Volumétrie

| Mesure | Valeur |
|---|---|
| Commits · auteurs | **56**, tous en juillet 2026 · 1 auteur |
| Web TS/TSX | 467 fichiers · **52 947 lignes** |
| Gateway Go | 26 fichiers · **5 945 lignes** |
| Tests | 42 unitaires web · 11 Go · 9 specs e2e |
| Tables · routes · pages | 45 · 85 · 35 |

### Exécution réelle

| Commande | Résultat |
|---|---|
| `bun run contracts:verify` | ✅ exit 0 — 85 routes + schéma inchangés (23 modules non référencés signalés) |
| `bun run test` (web) | ✅ **149 pass · 11 skip · 0 fail** — 160 tests / 43 fichiers, 794 ms |
| `bun run test` (shared) | ✅ 1 pass |
| `bun run typecheck` | ❌ exit 1 — **3 erreurs, toutes dans le cache généré** `apps/web/.next/dev/types/validator.ts`. **Zéro erreur dans `src/`.** `make dev-fresh` les efface. La CI part d'un checkout sans `.next` : non affectée. |
| `bun run test:gateway` | ⛔ **Go n'est pas installé sur la machine de dev** — couverture CI uniquement |

Les 11 `skip` sont les tests d'intégration Postgres, qui s'auto-désactivent sans `DATABASE_URL`. Le job CI
`web-db-integration` les exécute avec un vrai Postgres.

### CI — 5 jobs (`.github/workflows/ci.yml`)

`web-shared` (contracts + typecheck + lint + test + build) · `gateway` (Go + race) ·
`web-db-integration` (Postgres réel) · `telegram-control` (unittest Python) ·
`canary-smoke` (Playwright e2e sur Postgres, branches `integration/**`).

### Dettes connues

| # | Dette | Gravité | Preuve |
|---|---|---|---|
| 1 | Doublon `workspace`/`tenant` + `tasks`/`work_items` | 🔴 | §3 ci-dessus |
| 2 | `done` sans livrable | 🔴 | `work-runtime-service.ts:1395` |
| 3 | Audit : append-only acquis, mais ni chaîne de hash ni export | 🟠 | ✅ `drizzle/0002_audit_immutability.sql` installe le trigger `audit_events_reject_update`, qui **rejette tout UPDATE** au niveau base. ❌ Reste : aucune chaîne de hash (un `DELETE` puis ré-`INSERT` n'est pas détectable), aucun export CSV/JSON. Le `DELETE` est **volontairement** laissé à la cascade tenant, par alignement RGPD |
| 4 | UI d'approbation morte | 🟠 | `approval-actions.tsx` dans `docs/audit/unreferenced-modules.json` |
| 5 | 23 modules non référencés | 🟡 | `unreferenced-modules.json` — détecté à chaque audit, jamais purgé |
| 6 | Pages légales à trous | 🟠 | 14 marqueurs `[À COMPLÉTER : raison sociale / SIRET / DPO…]` dans `(legal)/**` |
| 7 | Secrets d'exemple | 🟡 | 5 placeholders `change-me` / `replace-with` dans `.env.example` ; génération **documentée mais manuelle** (`openssl rand`) |
| 8 | Fallback de secret en dur | 🟢 | `runtime-auth.ts:43` `?? "hermes-console-local-development"` — **atteignable seulement si `HERMES_GATEWAY_DERIVE_SECRETS=false`** ; la dérivation est active par défaut et la production refuse les secrets de dev (`gateway/config.go:149-152`, testé `config_test.go:31`) |
| 9 | Supervision | 🟡 | `/api/healthz` seulement — **pas de `/metrics`** |

### Ce qui est déjà solide (et souvent sous-estimé)

- **En-têtes de sécurité complets** : `next.config.ts:26-43` pose CSP, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin` et
  `Strict-Transport-Security: max-age=63072000; includeSubDomains` sur `/:path*`.
- **La production refuse de démarrer avec des secrets de développement** (Edge : `config.go:149-152` ;
  Next : `relay-identity.ts:18`, `gateway-url.ts:25` impose HTTPS pour un gateway distant).
- **`audit_events` est append-only au niveau base** : le trigger `audit_events_reject_update`
  (`drizzle/0002_audit_immutability.sql`) fait échouer tout `UPDATE`, indépendamment du code applicatif.
- **Sauvegardes runtime chiffrées AES-GCM**, vérifiées avant d'être marquées prêtes, avec sauvegarde de
  sécurité imposée avant restauration.
- **Control plane Travail complet** : file, claim, lease + heartbeat, release, événements, interventions,
  sweep des leases orphelins — 7 routes `/api/runtime/work/*`, testées
  (`work-runtime.integration.test.ts`, 1 220 lignes).
- **Import systemwide → Docker atomique** : allowlist, refus des liens symboliques, manifeste SHA-256,
  rollback bloqué si les condensats ont changé.

---

## 5. Exploitation

### Démarrage local

Prérequis : Bun, PostgreSQL, Docker + plugin Compose.

```bash
bun install
bun run db:migrate:product
make dev            # Next.js + Edge Go + Hermes Docker → http://localhost:3010
```

`make help` liste toutes les cibles. `make dev-fresh` arrête la stack et supprime le cache `.next` avant de
relancer. `Ctrl+C` sur `make dev` arrête Next.js puis `docker compose down` ; `make stop` produit le même
état depuis un autre terminal. Les volumes de données sont conservés.

Seul `127.0.0.1:8787` est publié : **le dashboard Hermes ne doit jamais être exposé directement** — il peut
exécuter des commandes et accéder aux fichiers du runtime. L'Edge Go est l'unique frontière publique (tickets
courts, HMAC, RBAC, profils forcés, allowlist de routes).

Base vide volontaire : `make db-reset CONFIRM=reset` (TRUNCATE `users` CASCADE + suppression des
profils Hermes sous `data/hermes/profiles/`). `make db-seed-demo` est idempotent et ne crée que deux
comptes — `owner@` et `member@atelier-lumiere.local`, mot de passe `demo-password` — sans organisation :
l'owner passe par `/onboarding` (tenant + workspace + installation runtime + premier agent), puis invite
le member depuis Réglages › Membres (mail dans Mailpit, http://localhost:8025).

### Variables importantes

`DATABASE_URL` · `HERMES_DEFAULT_GATEWAY_URL` (défaut `http://127.0.0.1:8787`) ·
`HERMES_DEFAULT_INSTALLATION_ID` · `HERMES_GATEWAY_ENV` · `HERMES_GATEWAY_TICKET_SECRET` ·
`HERMES_GATEWAY_SERVICE_SECRET` · `HERMES_GATEWAY_ALLOWED_HOSTS` · `HERMES_CONSOLE_URL` ·
`HERMES_WORK_ENABLED` / `_CAPACITY` / `_POLL_INTERVAL_MS` / `_ROOT` · les 6 drapeaux `WORK_*` ·
`HERMES_RUNTIME_TOKEN` · `HERMES_SESSION_CHANGE_DEBOUNCE_MS` (200) · `HERMES_SESSION_RECONCILE_MS` ·
`HERMES_ALLOWED_ORIGINS`. Liste exhaustive : `.env.example`.

### Installation en production

Prérequis : serveur Docker + Compose, domaine pointant dessus (A/AAAA), ports 80/443 ouverts.

1. **Secrets** — `cp .env.example .env`, puis une valeur **distincte** par clé :
   ```bash
   openssl rand -hex 32   # TICKET / SERVICE / RELAY_IDENTITY / BACKUP_ENCRYPTION / CRON secrets
   openssl rand -hex 24   # POSTGRES_PASSWORD
   ```
   Compléter `POSTGRES_USER/DB`, `HERMES_CONSOLE_DOMAIN`, `HERMES_ALLOWED_ORIGINS`, et
   `HERMES_GATEWAY_ENV=production` explicitement. Éditer `.env` **sur le serveur uniquement**.
2. **Postgres** — soit le service du compose (`postgres:17-alpine`, aucun port publié), soit une instance
   managée (alors `backup-postgres.sh` ne s'applique pas).
3. **Migrer** — via le service one-shot `migrate` (profil `migrate`), qui rejoint la base sur le réseau
   interne. À exécuter **avant** le premier démarrage de `web` et avant chaque mise à jour ajoutant une
   migration. Idempotent.
4. **Déployer** — `docker compose -f infra/prod/compose.console.yaml up -d --build`. Caddy obtient et
   renouvelle le TLS automatiquement ; `web` n'est jamais exposé directement.
5. **Premier owner** — déclarer son adresse dans `HERMES_OPERATOR_EMAILS` **avant** de s'inscrire :
   l'inscription est sur invitation, et l'opérateur est le seul compte qui n'a personne pour l'inviter.
   Puis inscription sur `https://<domaine>/register`, puis `/onboarding`.
6. **Enrôler l'Edge** — jeton depuis la page Installations, `infra/prod/compose.edge.yaml`,
   `hermes-gateway enroll`. Tunnel **sortant** mTLS ; le Relay multiplexe HTTP+WS sans exposer le port 9119.
7. **Vérifier** — `curl -fsS https://<domaine>/api/healthz`, puis un parcours manuel (connexion owner,
   création d'une tâche de test, présence dans le dashboard et l'audit).

### Mise en service d'un client (service managé)

Une seule Console héberge tous les clients ; **chaque client a son propre runtime**, sur son propre hôte.
Ce n'est pas un choix esthétique : `infra/prod/compose.runtime.yaml` est mono-instance par construction
(nom de projet figé, `edge` en `network_mode: service:hermes`, un seul `HERMES_INSTALLATION_ID`), et le
second tenant qui s'inscrirait sur une Console sans runtime propre reçoit une installation `checking` sans
moteur derrière (`lib/hermes/installations.ts:76-83`). Le rattachement d'un runtime **distant** est le
chemin que le code sait déjà faire.

1. **Créer l'organisation** — depuis le compte opérateur, `/onboarding`. La limite d'une organisation par
   compte ne s'applique pas aux adresses de `HERMES_OPERATOR_EMAILS`
   (`api/onboarding/complete/route.ts:30`).
2. **Provisionner le runtime du client** — sur un hôte dédié : `infra/prod/compose.runtime.yaml` +
   `infra/prod/compose.edge.yaml`, avec la clé d'inférence du client dans le `.env` du profil (BYOK).
3. **Rattacher** — page Installations → runtime existant. `connectInstallation`
   (`modules/installations/application/connect-installation.ts:6-52`) sonde le gateway, valide le profil et
   vérifie le headroom avant d'accepter. Origine enregistrée : `remote_existing`.
4. **Inviter le client** — invitation `owner` sur son adresse. C'est ce qui lui ouvre l'inscription :
   sans invitation, `/register` refuse (403).
5. **Vérifier** — un agent qui tourne côté client, et un envoi `relation_client` de bout en bout.

> **Ne pas automatiser avant la troisième mise en service à l'identique.** Trois clients installés à la
> main disent quel geste se répète vraiment ; un script écrit avant le premier fige des suppositions.

### Logging

Contrat : **stdout/stderr uniquement**, aucun fichier de log applicatif. Champs stables : `timestamp`,
`level`, `service` (`hermes-web` | `hermes-gateway`), `environment`, `message` (événement stable, ex.
`http.request.completed`), `requestId` (corrélation Web ↔ Edge ↔ réponse HTTP), `method`, `path`, `status`,
`durationMs`.

Les clés sensibles (authorization, cookies, credentials, mots de passe, clés privées, secrets, signatures,
tokens, webhooks) sont remplacées par `[REDACTED]`. **Ni query strings ni corps de requête** dans les access
logs.

Dev : `HERMES_LOG_LEVEL=info`, `HERMES_LOG_FORMAT=pretty`, `HERMES_LOG_HTTP=false`.
Prod : le Web passe en JSON automatiquement avec `NODE_ENV=production` ; l'Edge reçoit `json` explicitement.
`debug` doit rester temporaire en production.

Commandes : `make logs` · `logs-snapshot` · `logs-errors` · `logs-edge` · `logs-hermes`.

### Sauvegardes

**Deux systèmes indépendants, à ne pas confondre :**

| | `infra/prod/backup-postgres.sh` | `scripts/maintain-runtime-backups.ts` |
|---|---|---|
| Sauvegarde | Le Postgres produit (tenants, agents, tâches, audit) | Les backups Hermes *runtime* (profils, mémoire, config) |
| Déclenché par | Cron système | `make runtime-backups-maintain` |
| Format | `pg_dump --format=custom` | Archive chiffrée AES-GCM (Edge Go) |
| Portée | Toute la base | Un profil Hermes |

Postgres : `make prod-db-backup` → `backups/postgres/hermes-console-<db>-<ISO>.dump`, rétention
`HERMES_DB_BACKUP_RETENTION_DAYS` (14 j). Charger `.env` dans le shell avant (`set -a; source .env; set +a`).

Restauration **destructive** : `make prod-db-restore FILE=…` (`pg_restore --clean --if-exists`). Arrêter
`web` pendant l'opération.

Test de restauration, dans une base scratch dédiée, sans toucher la production :
```bash
infra/prod/backup-postgres.sh test-restore <fichier.dump>
infra/prod/backup-postgres.sh test-restore-cleanup
```
> Un test de restauration régulier est **la seule façon** de savoir qu'un dump est exploitable. Une
> sauvegarde jamais restaurée n'est qu'une hypothèse.

Sauvegarder aussi `backups/postgres/` **hors du serveur** : un backup qui ne quitte jamais la machine ne
protège ni d'une panne disque ni d'une perte de VM.

### Canary et rollback

```text
feature branch ──▶ integration/<nom> ──▶ canary ──▶ production
                   (contrats gelés)      (preuves)   │
                                                     └──▶ rollback = redéployer PREVIOUS_REF
```

Préconditions : brancher `integration/<nom>` depuis le commit relu · `contracts:verify` doit passer ·
noter `PREVIOUS_REF` et `CANDIDATE_REF` · sauvegarder la base.

Portes : `bun install --frozen-lockfile` puis `contracts:verify`, `typecheck`, `lint`, `test`,
`test:gateway`, `build:all`. La branche `integration/**` active le job CI `canary-smoke`.

Preuves métier attendues : connexion + redirection tenant · lecture/écriture d'inférence et messagerie agent
à payloads inchangés · connexion, détail et assignation d'installation · chemin chat via tunnel Relay/Edge ·
aucun nouveau taux de 4xx/5xx ni erreur de parsing de contrat.

**Déclencher un rollback immédiatement si** une route gelée change de méthode/chemin, l'isolation d'auth
échoue, une installation existante ne se reconnecte pas, le tunnel Edge/Relay tombe, ou une migration tente
de modifier le schéma.

### Validation complète

```bash
bun run typecheck && bun run lint && bun run build
bun run test && bun run test:gateway && bun run test:e2e
docker compose config --quiet
```

`bun run check` enchaîne contracts + typecheck + lint + test + test:gateway + build:all.
`bun run test:e2e` ne tourne qu'en canary d'intégration ou sur lancement explicite (il démarre un serveur
Next temporaire).

### Intégrations Hermes

**Clé d'inférence** — jamais dans `.env.local` de la Console. Hermes la lit dans le volume persistant :
`/opt/data/profiles/<profil>/.env` (Docker) ou `~/.hermes/profiles/<profil>/.env` (systemwide). Ajouter
`OPENAI_API_KEY=sk-...` sans guillemets, **puis** sélectionner le provider (`hermes -p <profil> model` →
`OpenAI API`) : la clé seule ne sélectionne pas le provider.

**Telegram / Discord** — configurés par agent dans `Paramètres → Intégrations`. Les tokens ne sont **ni
stockés en base ni renvoyés au navigateur** : Hermes les écrit dans le `.env` du profil, active le channel
dans son `config.yaml` et redémarre le gateway du profil. Discord exige le *Message Content Intent*.

Quand Telegram est actif, la Console synchronise l'extension `hermes-console-control` (versionnée dans ce
dépôt — **aucun fichier de l'installation Hermes n'est modifié**). `/work <brief>` crée une tâche assignée à
l'agent du profil et lance son run : ni webhook à déclarer, ni UUID à copier. Resynchronisation manuelle :
`bun run telegram-control:install --profile <profil> --restart`.

### Version du runtime Hermes

La Console suit **`latest`** : `HERMES_IMAGE_TAG=latest` (`.env.example:10`),
`infra/dev/compose.yaml:11` → `nousresearch/hermes-agent:${HERMES_IMAGE_TAG:-latest}`.

`scripts/sync-hermes-runtime-image.ts` tire l'image et purge les anciennes versions locales ;
`make runtime-sync-image` l'expose, et `make runtime-up` en dépend. Côté produit, la route
`/api/:tenantSlug/installations/:id/upgrades` déclenche une mise à niveau via un exécuteur de déploiement
allowlisté (`HERMES_UPGRADE_EXECUTABLE`) : l'image officielle ne supporte pas `hermes update` dans le
conteneur, donc le control plane **recrée le conteneur avec une image épinglée** puis valide la version
observée. Sans exécuteur déclaré, l'Edge n'annonce jamais la capacité d'upgrade.

> **Politique (D-G) :** suivre `latest`, **signaler** la disponibilité d'une version, **laisser le client
> l'exécuter**. La mise à jour n'est jamais silencieuse ni imposée. Le mécanisme de détection et de
> proposition reste à construire — aujourd'hui la synchronisation est manuelle
> (`make runtime-sync-image`) ou implicite au démarrage de la stack.

**Espaces de travail montés** — seul `./data/workspace` → `/workspace` en lecture seule par défaut. Un autre
répertoire exige `HERMES_WORKSPACE_DIR` explicite ; l'écriture exige en plus
`HERMES_WORKSPACE_READ_ONLY=false`. Aucun répertoire home global n'est monté implicitement. Les runs Travail
n'écrivent que dans `HERMES_WORK_DIR` (`/work`), un répertoire par tâche, un sous-répertoire par run, avec
manifeste de permissions ; l'Edge refuse tout segment invalide ou lien symbolique.

### SEO

Métadonnées centralisées dans `apps/web/src/lib/site.ts`, consommées par `layout.tsx` (OG, Twitter Card,
robots), `robots.ts` (autorise `/`, exclut `/api/` et `/_next/`) et `sitemap.ts` (**routes publiques
uniquement** : `/`, `/login`, `/register` — les vues `/:tenantSlug/**` sont volontairement hors index).

> En production, `HERMES_CONSOLE_URL` **doit** pointer vers le domaine public réel : il alimente
> `metadataBase`, les canonicals et l'hôte du sitemap.

---

## 6. Journal des décisions

Format : décision · date · conséquence. Une décision inscrite ici **prime sur tout document archivé**.

### D-A — Périmètre de la v1 · 24/07/2026 · **v1 vendable complète**

La v1 va jusqu'à la licence et la facturation incluses (E1→E5 du PRD-APPLIANCE archivé). Le produit doit
être installable par un tiers **et** encaissable.

### D-B — Modèle de tenancy · 24/07/2026 · **multi-tenant assumé, migration complète**

Le doublon `workspace`/`tenant` est supprimé, pas gelé. `workspaces` disparaît ; `tenant` devient l'unique
frontière d'isolation et de RBAC. Le doublon `tasks`/`work_items` est traité dans le même mouvement.

*Justification :* `schema.ts:88` impose déjà un workspace unique par tenant. Le mapping est donc bijectif et
la migration mécanique — 21 tables, un script, **zéro arbitrage de modélisation par ligne**. Geler la couche
aurait conservé pour toujours un alias sans valeur.

⚠️ **Cette décision renverse la décision D4 du `PRD-APPLIANCE.md`** (« Multi-tenant abandonné pour v1 :
1 appliance = 1 org »). Le PRD archivé est, sur ce point, **périmé**.

*Conséquence ouverte :* la licence portera-t-elle sur l'installation ou sur le tenant ? À trancher en J6.

### D-C — Contrat métier Travail · 24/07/2026 · **option A « agent = teammate »**

L'agent est un collègue sur le board : on lui assigne une issue, il en devient owner, exécute, commente,
bloque, livre. Le chat reste un mode conversation distinct.
➡️ Le contrat complet (`delivery_state` / `execution_state`, 4 triggers, définition de « livré ») est
spécifié au §3 de ce document et implémenté.

### D-D — Doctrine documentaire · 24/07/2026 · **cinq fichiers conservés**

`MEMORY.md` est la vérité durable. `PRODUCT.md` et `DESIGN.md` en sont des projections spécialisées et ne
peuvent pas la renverser. `CLAUDE.md` et `AGENTS.md` portent uniquement les instructions d'exécution.

| Fichier | Pourquoi il reste |
|---|---|
| `CLAUDE.md` | Configuration chargée par les agents de code, pas de la documentation |
| `AGENTS.md` | **Bloc machine-généré** (`<!-- BEGIN:nextjs-agent-rules -->`), inclus via `@AGENTS.md` |
| `PRODUCT.md` | Projection produit pour les outils UI ; dérivée de `MEMORY.md`, sans autorité décisionnelle propre |
| `DESIGN.md` | Projection du système visuel et des décisions d'interface |
| `MEMORY.md` | Vérité durable du produit, de l'architecture et des décisions |

### D-E — Surface produit · 24/07/2026 · **la Console web est LA surface**

Dans le vocabulaire du projet, « TUI » désigne **la Console elle-même**. Il n'y a **aucune interface
terminal à construire**. La barre de qualité — « la meilleure interface du marché » — porte sur l'application
web existante, et son critère d'acceptation est **qu'un non-développeur puisse construire et piloter un
agent sans terminal ni fichier**.

*Contexte :* le dossier parent s'appelle `tui-agentik` et Hermes Agent embarque sa propre TUI
(`ui-tui/`, `@hermes/ink`, React + Ink). Ni l'un ni l'autre n'implique une TUI dans ce dépôt — vérifié :
**zéro dépendance TUI** (`ink`, `bubbletea`, `textual`, `blessed`, `ratatui`) dans le monorepo.

### D-F — Canaux d'orchestration · 24/07/2026 · **parité Telegram / Discord**

Orchestrer un ou plusieurs agents doit être possible **depuis Telegram et depuis Discord, au même niveau** :
création de tâche, notifications d'intervention, réponses aux approbations.

Cette décision remplace toute doctrine antérieure qui plaçait Discord hors du périmètre d'exécution Work.
État actuel de l'asymétrie : §3 ci-dessus.

### D-G — Version du runtime Hermes · 24/07/2026 · **latest suivi, mise à jour proposée, exécutée par le client**

La Console reste alignée sur la dernière version d'Hermes (`latest`). Quand une version est disponible, la
Console le **signale** ; **le client décide** du moment de l'appliquer. Aucune mise à jour silencieuse,
aucune mise à jour imposée.

⚠️ **Nuance le `PRD-APPLIANCE.md` archivé**, qui recommandait d'épingler la version bundlée pour se protéger
d'une rupture d'API upstream. Le compromis retenu : suivre `latest`, mais **ne jamais l'appliquer sans acte
explicite du client**. Le risque résiduel — une release upstream qui casse — est assumé et mitigé par le
rollback et le health-check de la procédure de mise à jour (J5).

---

## 7. Ne pas casser

1. **Le gel de contrat** et sa procédure de re-baseline (§2). C'est le garde-fou qui a tenu jusqu'ici.
2. **Le contrat de passerelle partagé TS/Go** et son protocole signé (HMAC + nonce + fenêtre 30 s).
3. **Les 6 règles d'import** et la séparation en couches.
4. **Le plumbing du control plane Travail** — file, lease, heartbeat, sweep. Le contrat métier change en J1,
   **le plumbing reste**.
5. **Les 5 jobs CI**, en particulier le canary e2e sur Postgres réel.
6. **Bun** comme unique entrypoint JS.
7. **La frontière publique unique** : l'Edge Go. Le dashboard Hermes n'est jamais exposé directement.
8. **Le refus de démarrer en production avec des secrets de développement** (`config.go:149-152`).
