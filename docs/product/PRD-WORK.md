# PRD — Travail agentique dans Hermes Console

- Statut : implémenté — validation Docker réelle partielle
- Version : 1.1
- Date : 16 juillet 2026
- Branche de travail : `feature/work-control-plane-prd`
- Propriétaire produit : Hermes Console
- Périmètre : `apps/web`, `apps/gateway`, `packages/shared`, PostgreSQL et Relay existant
- Dépendance externe : aucune
- Référence conceptuelle : [Sinew](https://github.com/Paseru/sinew), sans dépendance de code ou de runtime

## 1. Résumé exécutif

La section **Travail** de Hermes Console doit devenir le système d'exploitation du travail réalisé conjointement par des humains et des agents Hermes.

Aujourd'hui, une « tâche » est essentiellement un modèle de prompt. Son lancement crée une session produit, ajoute un message, passe son statut à `running`, puis dépend du navigateur et du chat pour réellement démarrer Hermes. Il n'existe pas de file durable, de run revendiqué par un exécuteur, de lease, de reprise après crash, ni de séparation entre le sujet métier et ses tentatives d'exécution.

La cible reprend intégralement les principes des plateformes modernes de collaboration humains-agents, adaptés nativement à Hermes Console :

- les humains et les agents sont des acteurs assignables ;
- une tâche métier est distincte de ses runs d'exécution ;
- le plan interne d'un agent est distinct de la tâche métier et du run qui le porte ;
- assigner une tâche à un agent déclenche le travail automatiquement ;
- les commentaires, mentions, décisions et livrables restent attachés à la tâche ;
- l'exécution continue lorsque le navigateur est fermé ;
- chaque run dispose d'un cycle de vie durable, d'une session Hermes, d'événements et de règles de retry ;
- les projets structurent les tâches ;
- les équipes d'agents fournissent un routage stable par agent lead ;
- les automatisations créent des tâches traçables plutôt que d'exécuter des prompts invisibles ;
- l'Inbox concentre tout ce qui requiert l'attention d'un humain ;
- les validations et clarifications Hermes deviennent des interventions produit persistées et auditables.

Next.js et PostgreSQL restent l'autorité produit, RBAC et audit. L'Edge Gateway reçoit un **Work Executor** durable qui revendique les runs et pilote le profil Hermes imposé. Hermes reste l'autorité de l'exécution, des outils, des skills, de la mémoire et des sessions.

## 2. Architecture cible

```text
╔════════════════════════════════ Hermes Console ════════════════════════════════╗
║ ┌──────────────┐  HTTPS : tâches/commentaires  ┌────────────────────────────┐ ║
║ │ Navigateur   │ ─────────────────────────────▶ │ Next.js Work Control Plane │ ║
║ │ Travail UI   │ ◀───────────────────────────── │ RBAC / queue / audit       │ ║
║ └──────────────┘  SSE/WS : événements/inbox    └─────────────┬──────────────┘ ║
║                                                             │ SQL : état durable
║                                                             ▼                  ║
║                                                   ┌────────────────────────┐   ║
║                                                   │ PostgreSQL             │   ║
║                                                   │ work items / runs      │   ║
║                                                   │ events / interventions │   ║
║                                                   └────────────────────────┘   ║
╚═══════════════════════════════════════┬════════════════════════════════════════╝
                                        │ HTTPS/mTLS : claim/lease/events
                                        ▼
                              ┌──────────────────────┐
                              │ Relay Go optionnel   │
                              │ ou connexion directe │
                              └──────────┬───────────┘
                                         │ flux multiplexé : commandes/résultats
                                         ▼
╔══════════════════════ Installation Hermes locale ou distante ═════════════════╗
║ ┌────────────────────────────┐  JSON-RPC : session/prompt  ┌────────────────┐ ║
║ │ Edge Gateway              │ ────────────────────────────▶ │ Hermes Runtime │ ║
║ │ Work Executor             │ ◀──────────────────────────── │ profil forcé   │ ║
║ │ claim / lease / reprise   │  événements/interventions    │ tools / skills │ ║
║ └────────────────────────────┘                              └────────────────┘ ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

Légende : le navigateur manipule les objets métier ; l'Edge exécute les runs sans dépendre du navigateur ; le Relay transporte le même contrat lorsque l'installation n'est pas directement joignable.

Composants : UI Travail, Work Control Plane dans Next.js, PostgreSQL, Relay existant, Edge Work Executor et runtime Hermes existant.

## 3. Problème à résoudre

### 3.1 Limites actuelles

- `apps/web/src/lib/task-templates.ts` définit des types de prompts, pas un véritable modèle de travail.
- `POST /api/tasks/:taskId/run` crée une session et un message produit puis marque immédiatement la tâche `running`.
- le navigateur utilise ensuite `?autostart=1` pour réellement soumettre le prompt à Hermes ;
- une tâche ne référence pas explicitement l'agent ou l'installation qui doit l'exécuter ;
- la tâche contient directement le statut et l'output d'une unique tentative ;
- aucun service ne possède les transitions terminales `done` et `failed` ;
- aucun mécanisme ne protège contre les doubles exécutions ;
- aucune reprise fiable n'existe après crash de l'Edge ou indisponibilité Hermes ;
- les validations créées avant lancement ne couvrent pas proprement les interventions émises pendant un run Hermes ;
- il n'existe ni commentaires, ni mentions, ni projets, ni équipes d'agents, ni Inbox de travail.

### 3.2 Problème utilisateur

Un membre doit pouvoir créer une tâche, l'assigner à un humain ou à un agent, fermer son navigateur, puis revenir consulter une progression fiable, répondre aux blocages et récupérer un livrable.

Aujourd'hui, cette promesse n'est pas tenue : la section Travail expose une intention produit que le runtime ne réalise pas encore.

## 4. Vision produit

> Créez une tâche, assignez-la à un humain ou à une équipe d'agents Hermes, puis supervisez le travail, les décisions et les livrables depuis un espace unique.

Travail doit rendre les agents aussi faciles à mobiliser que des collègues sans masquer les conséquences importantes : permissions, coût, accès aux fichiers, outils utilisés, validations, erreurs et responsabilité humaine.

## 5. Principes non négociables

1. **Tâche et run sont deux objets différents.** Une tâche peut connaître plusieurs tentatives.
2. **Aucune exécution ne dépend du navigateur.** Fermer l'onglet ne change pas le run.
3. **Hermes est l'unique moteur d'agent.** Aucun second runtime agentique n'est ajouté.
4. **L'Edge est l'exécuteur.** Next.js ne maintient pas de processus Hermes longue durée.
5. **Next.js/PostgreSQL sont l'autorité produit.** RBAC, assignations, statuts métier, budgets et audit y restent persistés.
6. **Le profil est imposé par le contrat signé.** Un run ne choisit jamais librement un autre profil Hermes.
7. **Tout effet sensible peut demander une intervention.** Aucun mode d'auto-approbation globale n'est utilisé.
8. **Les événements sont idempotents.** Une reconnexion ou un retry réseau ne duplique ni commentaire ni résultat.
9. **Les secrets ne sont jamais persistés dans les événements de travail.** Une demande de secret utilise un canal éphémère.
10. **Les automatisations créent des tâches.** Aucun travail planifié ne reste invisible ou non auditable.
11. **Un humain reste responsable.** Toute exécution conserve son initiateur, son assignation et sa chaîne de délégation.
12. **L'isolation est explicite.** Aucun répertoire global, home utilisateur ou socket Docker n'est exposé implicitement.
13. **Le plan agent ne pollue pas le backlog.** Les étapes créées par Hermes restent attachées au run tant qu'elles ne sont pas explicitement promues en sous-tâches métier ou déléguées.

## 6. Utilisateurs et rôles

### Owner

- configure les politiques de travail du workspace ;
- crée et administre les équipes d'agents ;
- configure les automatisations et intégrations ;
- autorise les montages et capacités sensibles ;
- consulte tous les runs, coûts et événements du workspace.

### Member

- crée et modifie les tâches ;
- assigne des tâches aux acteurs autorisés ;
- commente et mentionne des agents ;
- exécute ou annule les tâches autorisées ;
- traite les interventions selon les permissions du workspace.

### Viewer

- consulte tâches, projets, commentaires, runs et livrables ;
- ne crée, n'assigne, ne commente, ne valide et n'annule rien.

### Agent Hermes

- peut être assigné ou mentionné ;
- exécute uniquement via son profil et son installation liés ;
- publie progression, commentaires et livrables ;
- peut proposer des sous-tâches ou déléguer lorsqu'il appartient à une équipe ;
- ne reçoit pas de notification utilisateur ; un déclencheur crée directement un run.

## 7. Navigation et surfaces

La sidebar cible devient :

```text
Workspace
├── Dashboard
└── Sessions

Travail
├── Inbox
├── Tâches
├── Projets
├── Automatisations
└── Validations

Ressources
├── Fichiers
└── Connaissances

Capacités
├── Skills
└── Agents et équipes

Administration
├── Installations
├── Intégrations
├── Event Logs
└── Paramètres
```

Légende : Travail contient les objets et déclencheurs métier ; Ressources contient les données utilisables par les runs ; Capacités contient la configuration des exécutants.

Composants : sidebar existante, routes workspace, pages Travail et surfaces de configuration existantes.

## 8. Concepts produit

### 8.1 Tâche

Objet durable décrivant un résultat attendu.

Champs principaux :

- identifiant lisible dans le workspace, par exemple `HC-42` ;
- titre ;
- description Markdown ;
- statut métier ;
- priorité ;
- créateur ;
- assigné principal : humain, agent ou équipe ;
- projet optionnel ;
- échéance optionnelle ;
- labels ;
- tâche parente optionnelle ;
- ressources attachées ;
- politique de revue ;
- date de création, première exécution et clôture.

États :

```text
┌─────────┐  action : planifier  ┌────────┐  action : démarrer  ┌──────────┐
│ Backlog │ ───────────────────▶ │ À faire │ ─────────────────▶ │ En cours │
└─────────┘                      └────────┘                      └────┬─────┘
                                                                    │ résultat : revue requise
                                                                    ▼
┌─────────┐  action : débloquer  ┌──────────┐  action : corriger  ┌──────────┐
│ Bloquée │ ───────────────────▶ │ En cours │ ◀────────────────── │ En revue │
└─────────┘                      └──────────┘                      └────┬─────┘
                                                                    │ action : accepter
                                                                    ▼
                                                               ┌──────────┐
                                                               │ Terminée │
                                                               └──────────┘
```

Légende : une tâche peut être annulée depuis tout état non terminal ; l'échec d'un run ne termine pas automatiquement la tâche.

Composants : tâche, assignation, run actif et décision de revue.

### 8.2 Run

Tentative d'exécution d'une tâche par un agent précis.

Un run conserve :

- la tâche source ;
- l'agent, l'installation et le profil Hermes ;
- le déclencheur : assignation, mention, automatisation, rerun ou API ;
- l'acteur humain responsable ;
- le numéro de tentative ;
- la session Hermes ;
- le statut d'exécution ;
- la lease et l'Edge propriétaire ;
- les timestamps de claim, démarrage, heartbeat et fin ;
- le résultat, la raison d'échec et les métriques ;
- le contexte et les ressources autorisées au moment du lancement.

États :

```text
┌────────┐  Edge : claim + lease  ┌───────────┐  Edge : session prête  ┌──────────┐
│ Queued │ ─────────────────────▶ │ Preparing │ ─────────────────────▶ │ Running  │
└────────┘                        └───────────┘                         └──────────┘

┌─────────┐  Hermes : intervention  ┌───────────────┐  humain : décision  ┌─────────┐
│ Running │ ──────────────────────▶ │ Waiting input │ ───────────────────▶ │ Running │
└─────────┘                         └───────────────┘                      └─────────┘

┌─────────┐  Hermes : succès  ┌───────────┐
│ Running │ ────────────────▶ │ Succeeded │
└─────────┘                   └───────────┘

┌─────────┐  Hermes : erreur  ┌────────┐
│ Running │ ────────────────▶ │ Failed │
└─────────┘                   └────────┘

┌───────────────────────────┐  utilisateur : annuler  ┌───────────┐
│ Queued/Preparing/Running │ ───────────────────────▶ │ Cancelled │
└───────────────────────────┘                         └───────────┘
```

Légende : une lease expirée requeue le run si l'erreur est récupérable et si la limite de tentatives n'est pas atteinte.

Composants : queue, Edge propriétaire, session Hermes, intervention et état terminal.

### 8.3 Plan d'exécution et étapes agent

Le plan est la checklist opérationnelle que l'agent crée et met à jour pendant un run, comme les plans visibles dans Codex CLI, Claude Code CLI ou Sinew. Il ne constitue pas une collection de tâches métier.

```text
╔══════════════════ Domaine Travail ══════════════════╗
║ ┌──────────────┐  tentative d'exécution  ┌────────┐ ║
║ │ Tâche métier │ ───────────────────────▶ │ Run    │ ║
║ └──────┬───────┘                         └───┬────┘ ║
║        │ promotion explicite                 │ plan Hermes : todo complet
║        ▲                                     ▼      ║
║ ┌──────┴───────────┐  délégation durable  ┌────────┐║
║ │ Sous-tâche métier│ ◀──────────────────── │ Étapes │║
║ └──────────────────┘  humain/agent autorisé└────────┘║
╚══════════════════════════════════════════════════════╝
```

Légende : Hermes décompose librement un run en étapes ; seule une promotion explicite crée un nouvel objet métier visible dans le backlog.

Composants : tâche métier, run Hermes, plan d'exécution, étapes agent et sous-tâche métier optionnelle.

Règles :

- Hermes reste l'autorité du plan vivant dans la session via son outil natif `todo` ;
- chaque résultat `tool.complete` dont `name = todo` contient la liste complète et remplace la projection courante du plan ;
- l'Edge transmet cette liste comme un événement Work structuré sans parser le texte libre de l'assistant ;
- PostgreSQL conserve une projection durable par run et des révisions ordonnées pour l'audit et la reconnexion UI ;
- les statuts Hermes `pending`, `in_progress`, `completed` et `cancelled` sont conservés sans inventer un pourcentage de vérité ;
- une seule étape devrait être `in_progress` ; une liste invalide reste affichable mais produit une alerte de diagnostic ;
- la liste complète reste disponible au modèle après chaque appel de l'outil et les étapes actives survivent à la compression de contexte Hermes ;
- `blocked` n'est pas inventé comme statut `todo` : l'UI décore l'étape active avec l'intervention ou le run enfant qui bloque réellement le run ;
- un retry d'infrastructure qui reprend la même session reprend le même plan ;
- un rerun manuel dans une nouvelle session crée un nouveau plan vide et conserve les révisions du run précédent ;
- terminer un run fige son dernier plan ; le plan n'est pas effacé de l'historique ;
- créer, renommer ou terminer une étape ne crée pas de notification Inbox et ne modifie pas automatiquement le statut métier ;
- une étape longue, assignable ou nécessitant un suivi autonome peut être promue explicitement en `work_item` enfant ;
- une délégation Hermes crée un run enfant lié par `parent_run_id` ; elle ne crée une sous-tâche métier que si la politique d'équipe ou une action explicite l'exige ;
- les détails de raisonnement privés ne sont jamais demandés ni persistés : seules la description courte, la position et l'état de l'étape sont stockés.

Cette adaptation reprend le principe central de Sinew : l'agent conserve une checklist structurée et toujours récupérable au lieu de dépendre d'un plan écrit une seule fois dans le transcript. Elle s'appuie sur le `todo` natif de Hermes plutôt que d'ajouter un second outil concurrent.

### 8.4 Commentaire et mention

Chaque tâche possède une timeline collaborative.

- un commentaire humain ne déclenche rien par défaut ;
- `@agent` crée un run ciblé sans modifier obligatoirement l'assigné principal ;
- une mention d'équipe crée un run pour l'agent lead ;
- plusieurs mentions distinctes peuvent créer des runs parallèles si la politique de concurrence l'autorise ;
- les commentaires d'agent sont identifiés comme tels ;
- un agent peut ajouter un commentaire de progression ou de résultat ;
- chaque commentaire généré conserve le `run_id` d'origine ;
- l'édition d'un commentaire déjà utilisé comme déclencheur ne réécrit jamais le contexte historique du run.

### 8.5 Projet

Un projet regroupe un objectif, des ressources, des acteurs et des tâches.

- nom, résumé et contexte Markdown ;
- statut et dates ;
- lead humain ou agent ;
- membres ;
- tâches et jalons ;
- ressources liées ;
- progression agrégée ;
- automatisations attachées ;
- activité récente.

### 8.6 Équipe d'agents

Une équipe fournit un point d'assignation stable.

- nom et description ;
- agent lead obligatoire ;
- agents membres ;
- politique de délégation ;
- limite de concurrence ;
- visibilité workspace ou restreinte.

Lorsqu'une tâche est assignée à une équipe :

1. un run est créé pour le lead ;
2. le lead peut traiter la tâche ou publier un plan `todo` ;
3. si `autoDelegatePlanSteps` est actif, chaque étape encore `pending` crée de façon idempotente un run enfant
   ciblé sur le profil d'un vrai membre, réparti de façon déterministe ;
4. une délégation Hermes native reste projetée comme run enfant synthétique lorsqu'elle ne désigne pas de profil
   Console ;
5. la délégation ne crée jamais de tâche métier implicite ;
6. le run enfant ne peut pas terminer la tâche à la place du lead ;
7. la chaîne de responsabilité et le profil membre restent visibles ;
8. la fin du run enfant réveille le lead si une synthèse est nécessaire.

### 8.7 Automatisation

Une automatisation possède :

- un déclencheur `cron`, `webhook`, `event` ou `manual` ;
- un fuseau horaire ;
- un modèle de tâche ;
- un projet cible ;
- un assigné humain, agent ou équipe ;
- une politique de déduplication ;
- une politique de concurrence ;
- un statut actif/inactif ;
- un historique des déclenchements.

Chaque déclenchement crée une tâche ou un nouveau run sur une tâche récurrente selon la configuration. Il ne soumet jamais un prompt directement à Hermes.

### 8.8 Intervention

Objet unifié représentant une action humaine nécessaire pendant un run :

- approbation d'outil ;
- clarification ;
- confirmation `sudo` ;
- fourniture éphémère d'un secret ;
- validation avant lancement ;
- revue d'un livrable.

États : `pending`, `approved`, `rejected`, `answered`, `expired`, `cancelled`.

Une intervention conserve le run, l'agent, la session Hermes, le request ID Hermes, le type, la question redigée, l'auteur de la décision et les timestamps. Un secret fourni n'est jamais stocké dans `payload`, les événements, les logs ou l'audit.

### 8.9 Inbox

L'Inbox agrège les événements nécessitant l'attention de l'utilisateur :

- intervention assignée ;
- mention ;
- tâche assignée à l'utilisateur ;
- agent bloqué ;
- run définitivement échoué ;
- livrable prêt à relire ;
- automatisation en erreur ;
- dépassement de budget ou de capacité.

Chaque item possède un état non lu/lu, un lien vers l'objet source et une raison explicite. Les Viewers ne reçoivent que les événements consultables selon leur scope.

### 8.10 Session de chat

Le chat existant reste une conversation privée et exploratoire avec un agent. Il n'est pas remplacé par Travail.

Deux ponts sont ajoutés :

- « Créer une tâche depuis cette session » ;
- « Ouvrir la session Hermes du run » depuis une tâche.

La session Hermes d'un run reste canonique même si la représentation produit est archivée.

## 9. Modèle de données cible

### 9.1 Tables principales

#### `projects`

- `id`, `workspace_id`, `key`, `name`, `description` ;
- `status`, `lead_user_id`, `lead_agent_id` ;
- `starts_at`, `due_at`, `created_at`, `updated_at`.

#### `work_items`

- `id`, `workspace_id`, `project_id`, `number`, `key` ;
- `title`, `description`, `status`, `priority` ;
- `creator_user_id` ;
- `assignee_type`, `assignee_user_id`, `assignee_agent_id`, `assignee_team_id` ;
- `parent_work_item_id`, `due_at`, `review_policy` ;
- `first_run_at`, `completed_at`, `cancelled_at` ;
- `created_at`, `updated_at`.

Contraintes :

- clé unique `(workspace_id, number)` ;
- un seul type d'assigné principal ;
- toutes les références appartiennent au même workspace ;
- le statut est validé par le domaine, pas par une chaîne libre dans l'UI.

#### `work_item_comments`

- `id`, `work_item_id`, `author_type`, `author_user_id`, `author_agent_id` ;
- `source_run_id`, `content`, `edited_at`, `created_at`.

#### `work_item_labels` et `work_item_label_links`

- labels configurables par workspace ;
- couleur accessible et nom unique par workspace.

#### `work_item_dependencies`

- `work_item_id`, `depends_on_work_item_id`, `created_by_user_id`, `created_at` ;
- interdiction des auto-dépendances et détection des cycles.

#### `work_runs`

- `id`, `work_item_id`, `workspace_id` ;
- `agent_id`, `runtime_installation_id`, `hermes_profile_name` ;
- `trigger_type`, `trigger_comment_id`, `automation_id` ;
- `originator_user_id`, `parent_run_id` ;
- `status`, `attempt`, `max_attempts`, `failure_reason` ;
- `claimed_by_edge_id`, `lease_token_hash`, `lease_expires_at` ;
- `agent_session_id`, `hermes_session_id` ;
- `queued_at`, `claimed_at`, `started_at`, `last_heartbeat_at`, `completed_at` ;
- `result_summary`, `usage`, `cost`, `created_at`, `updated_at`.

#### `work_run_plan_revisions`

- `id`, `run_id`, `sequence`, `source_event_sequence` ;
- `items_snapshot`, `active_step_id`, `created_at` ;
- unicité `(run_id, sequence)` et `(run_id, source_event_sequence)` ;
- snapshot borné, validé et redigé de la liste complète renvoyée par Hermes.

Une révision représente un remplacement atomique de la checklist. Recevoir deux fois le même événement Hermes ne crée pas deux révisions.

#### `work_run_plan_steps`

- `id`, `run_id`, `hermes_step_id`, `position` ;
- `content`, `status` ;
- `first_seen_revision_id`, `last_seen_revision_id` ;
- `promoted_work_item_id`, `delegated_run_id` ;
- `started_at`, `completed_at`, `cancelled_at`, `created_at`, `updated_at` ;
- unicité `(run_id, hermes_step_id)`.

Cette table est la projection courante optimisée pour l'UI. Les révisions restent la source d'audit et permettent de reconstruire le plan après une reconnexion.

#### `work_run_events`

- `id`, `run_id`, `sequence`, `type`, `payload`, `visibility` ;
- `occurred_at`, `created_at` ;
- unicité `(run_id, sequence)` pour l'idempotence.

Les deltas de texte très fréquents ne sont pas conservés un par un indéfiniment. Ils sont agrégés en messages ou snapshots bornés.

#### `work_interventions`

- `id`, `workspace_id`, `work_item_id`, `run_id` ;
- `agent_id`, `agent_session_id`, `hermes_request_id` ;
- `type`, `status`, `prompt`, `safe_payload` ;
- `decided_by_user_id`, `decided_at`, `expires_at`, `created_at`.

#### `work_automations`

- `id`, `workspace_id`, `project_id`, `name`, `status` ;
- `trigger_type`, `trigger_config`, `timezone` ;
- `work_item_template`, `assignee_type`, identifiants d'assignation ;
- `dedupe_policy`, `concurrency_policy` ;
- `last_triggered_at`, `next_trigger_at`, `created_at`, `updated_at`.

#### `agent_teams` et `agent_team_members`

- équipe, lead, membres, politique et visibilité ;
- un agent archivé ne peut plus recevoir de nouvelle délégation.

#### `inbox_items`

- `id`, `workspace_id`, `user_id`, `type`, `source_type`, `source_id` ;
- `reason`, `read_at`, `created_at` ;
- index sur `(user_id, read_at, created_at)`.

### 9.2 Migration depuis le modèle actuel

1. créer les nouvelles tables sans supprimer `tasks`, `chat_sessions`, `messages` ou `approvals` ;
2. backfiller chaque `tasks` vers `work_items` avec sa clé et son statut convertis ;
3. convertir les exécutions existantes en `work_runs` lorsque leur session est identifiable ;
4. relier les validations existantes à `work_interventions` ;
5. faire lire les nouvelles routes uniquement depuis le nouveau modèle ;
6. conserver une fenêtre de compatibilité en lecture pour les anciennes URLs ;
7. supprimer les anciennes écritures après validation de la parité ;
8. retirer les tables legacy dans une migration séparée et réversible.

La migration doit être idempotente et produire un rapport de comptage avant/après.

## 10. Contrat Work Control Plane ↔ Edge

### 10.1 Authentification

- l'Edge utilise son identité d'installation enrôlée ;
- chaque requête est liée au tenant et à l'installation ;
- le profil et l'agent sont fournis par le serveur et signés ;
- les appels directs utilisent la signature de service existante ;
- les appels relayés utilisent l'identité mTLS existante ;
- aucun token utilisateur navigateur n'est accepté sur les endpoints Edge Work.

### 10.2 Endpoints Console appelés par l'Edge

- `POST /api/runtime/work/claim` : claim atomique d'un ou plusieurs runs ;
- `POST /api/runtime/work/runs/:runId/start` : confirme la session Hermes et le démarrage ;
- `POST /api/runtime/work/runs/:runId/heartbeat` : renouvelle la lease ;
- `POST /api/runtime/work/runs/:runId/events` : envoie un batch ordonné d'événements ;
- `POST /api/runtime/work/runs/:runId/interventions` : crée ou actualise une intervention ;
- `POST /api/runtime/work/runs/:runId/complete` : termine le run ;
- `POST /api/runtime/work/runs/:runId/release` : rend un run non démarré à la queue.

Le claim utilise une transaction PostgreSQL avec verrouillage des candidats et exclusion des lignes déjà revendiquées. La réponse contient une lease opaque, jamais sa forme persistée.

### 10.3 Commandes Console vers l'Edge

- réveil `work.available` ;
- annulation d'un run ;
- réponse à une intervention ;
- rotation/révocation de lease ;
- demande de reprise après reconnexion.

Le réveil est une optimisation. La récupération reste correcte si le signal est perdu grâce au claim périodique à faible fréquence et à la réconciliation après reconnexion.

### 10.4 Spécification de run envoyée à l'Edge

- IDs de run, tâche, workspace et agent ;
- installation et profil Hermes imposés ;
- prompt construit côté produit ;
- contexte de tâche et commentaires autorisés ;
- ressources et montages explicitement autorisés ;
- skills et MCP déjà configurés sur le profil ;
- modèle/raisonnement optionnels ;
- politique d'intervention ;
- timeout et budget ;
- session Hermes à reprendre, le cas échéant ;
- clé d'idempotence.

## 11. Edge Work Executor

### 11.1 Responsabilités

- annoncer sa capacité et sa concurrence disponible ;
- revendiquer des runs compatibles avec son installation ;
- préparer un espace de travail isolé ;
- ouvrir ou reprendre la session Hermes du profil imposé ;
- soumettre le prompt sans navigateur ;
- traduire les événements Hermes en événements Work ;
- normaliser chaque liste `todo` complète en révision de plan idempotente ;
- renouveler la lease ;
- suspendre le run sur intervention ;
- appliquer les décisions reçues ;
- interrompre Hermes sur annulation ;
- terminer ou relâcher le run de façon idempotente ;
- reprendre les runs récupérables après redémarrage.

### 11.2 Méthodes Hermes utilisées

- `session.create` ;
- `session.resume` ;
- `session.interrupt` ;
- `session.info` ;
- `session.cwd.set` lorsque la capacité est disponible ;
- `prompt.submit` ;
- `approval.respond` ;
- `clarify.respond` ;
- `sudo.respond` ;
- `secret.respond` via canal éphémère ;
- événements `message.*`, `tool.*`, `subagent.*`, `status.update`, `error` et demandes d'intervention ;
- `tool.complete` avec `name = todo` comme source canonique du plan courant et de sa liste complète ;

Le contrat doit être centralisé dans `packages/shared` et reflété par des tests Go et TypeScript.

Le normalisateur Work produit les événements `run.plan.updated` et `run.plan.step_changed`. Il ignore `args.todos` de `tool.start`, qui peut ne contenir qu'un patch partiel, et utilise exclusivement la liste complète de `tool.complete`.

### 11.3 Concurrence

- défaut : un run actif par profil Hermes ;
- limite configurable par installation ;
- aucune double utilisation concurrente d'une session Hermes ;
- une équipe peut exécuter plusieurs agents différents en parallèle ;
- un run `waiting_input` conserve sa session mais peut libérer une partie de la capacité selon les capacités Hermes observées.

### 11.4 Isolation et workdir

Chaque tâche possède un espace logique persistant, chaque run un sous-répertoire d'exécution :

```text
workspaces/<workspace-id>/work/<work-item-id>/
├── context/
├── resources/
├── runs/<run-id>/
├── output/
└── manifest.json
```

Légende : `context` contient les instructions produit, `resources` les données explicitement autorisées, `runs` les artefacts temporaires et `output` les livrables conservés.

Composants : workspace produit, tâche, run, ressources et livrables.

Règles :

- lecture seule par défaut ;
- écriture uniquement dans l'espace de la tâche ou les chemins explicitement autorisés ;
- aucun home global monté ;
- aucun socket Docker ;
- manifeste des entrées et permissions ;
- nettoyage des artefacts régénérables après TTL ;
- conservation du résultat, du manifeste et des références de session ;
- refus des liens symboliques sortant du scope autorisé.

## 12. Orchestration des déclencheurs

```text
┌────────────────────────────┐  assignation / mention / trigger  ┌─────────────────┐
│ Déclencheurs Travail       │ ─────────────────────────────────▶ │ Créateur de run │
│ tâche / mention / automate │                                   └────────┬────────┘
└────────────────────────────┘                                            │ transaction : enqueue
                                                                            ▼
                                                                   ┌─────────────────┐
                                                                   │ Queue durable   │
                                                                   └─────────────────┘
```

Légende : tous les déclencheurs convergent vers le même service de création de run et la même queue.

Composants : tâche, commentaire, automatisation, créateur de run et queue.

Règles :

- assigner à un agent crée un run si aucun run équivalent actif n'existe ;
- assigner à un humain ne crée pas de run ;
- réassigner annule les runs `queued` de l'ancien assigné et demande l'annulation des runs actifs selon confirmation ;
- une mention possède une clé de déduplication fondée sur commentaire + agent ;
- modifier un commentaire ne recrée pas automatiquement de run ;
- un rerun manuel crée une nouvelle tentative et, par défaut, une nouvelle session ;
- un retry d'infrastructure peut reprendre la session précédente ;
- une automatisation ne retry pas au-delà de sa politique explicite afin d'éviter le chevauchement avec son prochain déclenchement.

## 13. Retry, reprise et annulation

### Erreurs récupérables

- Edge déconnecté avant démarrage ;
- runtime Hermes temporairement indisponible ;
- lease expirée ;
- tunnel Relay interrompu ;
- timeout de préparation ;
- crash Edge avec session Hermes récupérable.

### Erreurs non récupérables automatiquement

- erreur explicite de l'agent ;
- credential fournisseur invalide ;
- budget dépassé ;
- permission refusée ;
- ressource requise absente ;
- intervention rejetée ;
- contexte ou profil invalide.

Politique par défaut : une tentative initiale plus un retry automatique pour une erreur d'infrastructure. Le rerun manuel n'a pas de plafond métier mais reste soumis aux budgets et permissions.

L'annulation :

1. passe le run en `cancelling` de façon atomique ;
2. envoie `session.interrupt` à Hermes via l'Edge propriétaire ;
3. attend l'accusé ou l'expiration de la lease ;
4. termine en `cancelled` ;
5. ne supprime ni la tâche, ni la session, ni l'historique.

## 14. UX détaillée

### 14.1 Liste et board des tâches

- vues Liste et Board ;
- filtres : statut, priorité, projet, assigné, labels, créateur, échéance ;
- vues sauvegardées par utilisateur ;
- recherche texte ;
- création rapide clavier ;
- compteurs de runs actifs, interventions et éléments non lus ;
- drag-and-drop accessible avec alternative clavier ;
- état temps réel sans polling par onglet.

### 14.2 Détail d'une tâche

En-tête : clé, titre, statut, priorité, assigné, projet et échéance.

Corps :

- description ;
- sous-tâches et dépendances ;
- ressources ;
- livrables ;
- timeline unifiée des commentaires, runs, interventions et changements métier ;
- composer avec mentions ;
- panneau de run actif : agent, installation, session, durée, coût et état ;
- panneau « Plan de l'agent » : checklist live, étape active, état bloqué et compteur terminé/total ;
- historique des runs avec retry, annulation et transcript ;
- action « Ouvrir dans Sessions ».

Le panneau de plan :

- remplace atomiquement la checklist lorsque la nouvelle révision arrive ;
- affiche les étapes complétées sans les supprimer ;
- montre « Plan en cours de construction » tant que Hermes n'a pas encore appelé `todo` ;
- indique « Aucun plan structuré » si le run se termine sans appel `todo`, sans considérer cela comme une erreur ;
- affiche un compteur `terminées / total`, jamais un pourcentage présenté comme une mesure d'avancement fiable ;
- permet à un Member ou Owner de promouvoir une étape en sous-tâche métier ;
- permet d'ouvrir le run enfant lorsqu'une étape a été déléguée ;
- regroupe les mises à jour fréquentes dans la timeline pour éviter le bruit.

### 14.3 Inbox

- sections « Action requise », « Assigné à moi », « Suivi » ;
- lecture individuelle et « tout marquer comme lu » ;
- action inline lorsque la décision est sûre ;
- ouverture du contexte complet avant toute action sensible ;
- mise à jour temps réel.

### 14.4 Projets

- vue d'ensemble ;
- progression ;
- jalons ;
- membres et agents ;
- tâches filtrées ;
- ressources ;
- automatisations ;
- activité.

### 14.5 Automatisations

- liste active/inactive ;
- éditeur de trigger ;
- aperçu de la tâche qui sera créée ;
- prochain déclenchement dans le fuseau choisi ;
- historique des déclenchements ;
- bouton « Exécuter maintenant » ;
- erreur claire si l'assigné ou le runtime est indisponible.

### 14.6 Validations

La page existante devient une vue filtrée des interventions :

- type et niveau de risque ;
- tâche, agent, run et session ;
- contexte redigé ;
- expiration ;
- décision et auteur ;
- historique ;
- lien vers la tâche.

## 15. API produit

Routes workspace-scoped :

- `GET/POST /api/:tenant/:workspace/work-items` ;
- `GET/PATCH/DELETE /api/:tenant/:workspace/work-items/:id` ;
- `POST /api/:tenant/:workspace/work-items/:id/assign` ;
- `POST /api/:tenant/:workspace/work-items/:id/runs` ;
- `POST /api/:tenant/:workspace/work-runs/:runId/plan-steps/:stepId/promote` ;
- `POST /api/:tenant/:workspace/work-items/:id/cancel` ;
- `GET/POST /api/:tenant/:workspace/work-items/:id/comments` ;
- `GET /api/:tenant/:workspace/work-items/:id/timeline` ;
- `GET/POST /api/:tenant/:workspace/projects` ;
- `GET/POST /api/:tenant/:workspace/agent-teams` ;
- `GET/POST /api/:tenant/:workspace/automations` ;
- `POST /api/:tenant/:workspace/automations/:id/run` ;
- `GET/PATCH /api/:tenant/:workspace/inbox` ;
- `GET/PATCH /api/:tenant/:workspace/interventions/:id`.

Toutes les routes passent par `getWorkspaceAccessBySlugs` ou son successeur de module, valident le rôle et refusent les IDs appartenant à un autre workspace.

## 16. Temps réel

Le temps réel Work utilise un flux workspace-scoped côté produit :

- `work_item.created|updated|deleted` ;
- `comment.created|updated` ;
- `run.queued|claimed|started|progress|waiting_input|completed` ;
- `run.plan.updated|step_changed` ;
- `intervention.created|resolved` ;
- `inbox.created|read` ;
- `automation.triggered|failed`.

Les événements envoyés au navigateur ne contiennent aucun secret, credential, chemin hôte sensible ou payload brut d'outil non redigé.

La reconnexion recharge un snapshot canonique depuis PostgreSQL puis reprend après un curseur. Le flux n'est jamais l'unique source de vérité.

## 17. Permissions et gouvernance

- création/modification/assignation : Member ou Owner ;
- configuration projet/équipe/automatisation : Owner par défaut, déléguable ;
- validation : politique workspace + rôle ;
- accès aux ressources : snapshot des permissions au lancement, revérification avant effet sensible ;
- installation/profil : imposés par l'agent produit ;
- budget : contrôlé avant enqueue puis pendant le run si métriques disponibles ;
- chaque mutation écrit un audit event ;
- les événements d'agent sont attribués au run et à l'utilisateur originator ;
- aucune délégation ne peut augmenter les permissions de l'originator.

## 18. Sécurité

- authentification Edge par identité d'installation ;
- signatures anti-rejeu avec timestamp et request ID ;
- lease opaque et hashée en base ;
- validation stricte du profil, de l'installation et du workspace ;
- payloads bornés ;
- événements séquencés et idempotents ;
- redaction des logs et résultats ;
- absence de mode global auto-approve ;
- secret transmis via réponse éphémère et jamais persisté ;
- montages en lecture seule par défaut ;
- aucun accès implicite au home ou au socket Docker ;
- contrôle des liens symboliques et traversées de chemin ;
- audit de toute décision humaine et de toute annulation.

## 19. Observabilité

Chaque log Work doit comporter :

- `request_id`, `tenant_id`, `workspace_id` ;
- `work_item_id`, `run_id`, `agent_id` ;
- `installation_id`, `profile` ;
- `event_sequence`, `attempt`, `lease_owner` lorsque pertinent ;
- catégorie d'erreur stable ;
- durée et état terminal.

Métriques :

- profondeur de queue ;
- temps avant claim ;
- temps de préparation et d'exécution ;
- runs actifs par installation et profil ;
- taux de succès/échec/retry ;
- leases expirées ;
- interventions en attente et délai de décision ;
- coût et tokens par tâche, projet et agent ;
- automatisations réussies/échouées.

## 20. Objectifs de performance et fiabilité

- création d'une tâche : p95 inférieur à 500 ms hors pièce jointe ;
- signal de run disponible à l'Edge : inférieur à 2 s lorsque connecté ;
- affichage de progression : inférieur à 1 s après réception côté Console ;
- claim atomique sans double exécution sous concurrence ;
- reprise après reconnexion Edge : inférieure à 30 s ;
- aucune perte d'état après redémarrage Next.js, Edge ou navigateur ;
- un événement dupliqué produit exactement le même état final ;
- pagination obligatoire sur tâches, timeline, runs et Inbox.

## 21. Plan d'implémentation

### Phase 0 — Contrats et fondations

- créer les types de domaine et machines d'état ;
- créer les tables `projects`, `work_items`, `work_runs`, `work_run_plan_revisions`, `work_run_plan_steps`, `work_run_events` et `work_interventions` ;
- ajouter la migration/backfill legacy ;
- centraliser le contrat Work dans `packages/shared` ;
- ajouter les tests de transitions et d'isolation workspace.

Sortie : le nouveau modèle est lisible et testable, sans exécution réelle.

### Phase 1 — Exécution Hermes sans navigateur

- ajouter les endpoints claim/start/heartbeat/events/complete ;
- ajouter le Work Executor dans l'Edge ;
- piloter `session.create` et `prompt.submit` ;
- persister session et événements ;
- capter `tool.complete(name = todo)` et persister la projection du plan ;
- terminer le run et la tâche ;
- retirer `?autostart=1` du parcours Travail.

Sortie : une tâche assignée à un agent s'exécute après fermeture du navigateur.

### Phase 2 — Fiabilité et interventions

- lease, heartbeat, reprise et retry ;
- annulation ;
- approbation, clarification, sudo et secret éphémère ;
- réconciliation après redémarrage Edge ;
- limites de concurrence et budgets ;
- tests Relay.

Sortie : les erreurs et blocages sont récupérables et auditables.

### Phase 3 — Collaboration Travail

- nouvelle page Tâches liste/board ;
- détail et timeline ;
- checklist live du plan agent et promotion en sous-tâche ;
- commentaires et mentions ;
- assignation humain/agent ;
- Inbox ;
- nouvelle page Validations ;
- ponts avec Sessions.

Sortie : le travail humain-agent est utilisable de bout en bout.

### Phase 4 — Projets, équipes et automatisations

- projets et jalons ;
- équipes d'agents et délégation lead ;
- automatisations cron/webhook/event ;
- triggers, déduplication et historique ;
- ressources projet et tâche.

Sortie : la totalité du modèle Travail cible est disponible.

### Phase 5 — Durcissement et migration finale

- tests de charge et concurrence ;
- chaos tests Edge/Relay/Hermes ;
- accessibilité et responsive ;
- observabilité complète ;
- suppression des écritures legacy ;
- migration finale des anciennes tables ;
- documentation opérateur et utilisateur.

Sortie : fonctionnalité prête à être activée par défaut.

## 22. Tests et preuves attendues

### Unitaires

- transitions tâche/run/intervention ;
- remplacement, redaction et mapping des plans Hermes ;
- promotion explicite d'une étape sans création implicite de tâche ;
- permissions et attribution ;
- sélection d'installation/profil ;
- clés de déduplication ;
- classification retryable/non-retryable ;
- redaction ;
- construction du contexte Hermes.

### Base de données

- claims concurrents avec une seule victoire ;
- expiration et renouvellement de lease ;
- unicité des séquences d'événements ;
- idempotence des révisions de plan et unicité des étapes par run ;
- isolation tenant/workspace ;
- migration et rollback ;
- cycles de dépendances refusés.

### Go Edge

- claim, heartbeat, release et completion ;
- perte réseau ;
- crash avant/après `prompt.submit` ;
- reprise de session ;
- annulation ;
- intervention et réponse ;
- normalisation du `todo` complet reçu sur `tool.complete` ;
- refus d'utiliser le patch partiel reçu sur `tool.start` comme état canonique ;
- limites de concurrence ;
- payloads invalides et signatures expirées.

### Intégration réelle

- Edge vers Hermes Docker officiel ;
- tâche exécutée navigateur fermé ;
- profil correct forcé ;
- progression et livrable persistés ;
- plan Hermes mis à jour en direct, restauré après reconnexion et figé à la fin ;
- retry avec reprise de session conservant le plan ;
- rerun en nouvelle session démarrant avec un plan indépendant ;
- Hermes offline puis retour online ;
- redémarrage Edge pendant un run ;
- approval Hermes mise en attente puis reprise ;
- direct et Relay ;
- aucune double exécution après reconnexion.

### E2E navigateur

- création et assignation ;
- board/list et filtres ;
- commentaire et `@mention` ;
- progression temps réel ;
- checklist du plan et promotion d'une étape en sous-tâche ;
- Inbox ;
- validation ;
- retry et annulation ;
- projet, équipe et automatisation ;
- viewer en lecture seule ;
- responsive et navigation clavier.

Commandes de validation :

```bash
bun run typecheck
bun run lint
bun run test
bun run test:gateway
bun run test:e2e
```

## 23. Critères d'acceptation produit

La fonctionnalité est acceptée lorsque :

1. un Member crée une tâche et l'assigne à un agent Hermes ;
2. un run est créé et revendiqué par l'Edge lié à cet agent ;
3. fermer immédiatement le navigateur n'interrompt pas l'exécution ;
4. le profil Hermes imposé reçoit le prompt et produit des événements ;
5. la timeline affiche une progression compréhensible sans exposer le protocole brut ;
6. une demande d'approbation bloque le run et apparaît dans Inbox/Validations ;
7. la décision humaine reprend le même run et la même session ;
8. le résultat terminal crée un livrable/commentaire et actualise la tâche ;
9. une panne Edge ou Relay ne produit aucune double exécution ;
10. un retry d'infrastructure reprend correctement, tandis qu'un rerun manuel crée une nouvelle tentative ;
11. une mention d'agent dans un commentaire crée un run ciblé ;
12. un agent lead peut déléguer à un membre de son équipe avec une chaîne visible ;
13. une automatisation crée une tâche traçable et assignée ;
14. les rôles, budgets, profils et ressources restent strictement scoped ;
15. aucun secret n'apparaît en base, dans les événements ou dans les logs ;
16. les parcours fonctionnent en mode direct et Relay ;
17. les anciennes tâches restent consultables après migration ;
18. le plan créé par Hermes apparaît en direct, survit à une reconnexion et reste consultable après la fin du run ;
19. modifier une étape du plan ne crée aucune tâche métier implicite ;
20. promouvoir explicitement une étape crée une sous-tâche liée sans dupliquer le run courant ;
21. les tests unitaires, Go, intégration et E2E sont verts.

## 24. Non-objectifs

- intégrer ou embarquer une plateforme externe de gestion de tâches ;
- supporter d'autres moteurs d'agents que Hermes ;
- déplacer l'authentification ou le RBAC dans l'Edge ;
- exposer directement le port Hermes `:9119` ;
- faire du navigateur un worker ;
- fournir un éditeur généraliste de workflows visuels dans la première livraison ;
- autoriser implicitement l'écriture dans n'importe quel répertoire hôte ;
- remplacer le chat privé existant par les commentaires de tâche.

## 25. Risques et mitigations

### Double exécution

Mitigation : claim transactionnel, lease opaque, idempotency key et completion compare-and-set.

### Edge crash après soumission du prompt

Mitigation : épingler la session Hermes avant de confirmer `started`, réconcilier la session au redémarrage et refuser toute seconde soumission sans preuve d'absence.

### Volume d'événements trop important

Mitigation : batching Edge, séquences, agrégation des deltas, snapshots bornés et politique de rétention.

### Blocage permanent sur intervention

Mitigation : expiration explicite, notification Inbox, politique workspace et annulation opérateur.

### Permissions modifiées pendant un run

Mitigation : snapshot au lancement et revérification avant chaque décision ou effet sensible.

### Conflit entre automatisations Console et crons Hermes existants

Mitigation : toute nouvelle automatisation produit appartient à la Console ; les crons Hermes existants sont présentés comme runtime-managed, importables ou désactivables, sans duplication silencieuse.

### Workdir trop permissif

Mitigation : lecture seule par défaut, allowlist de chemins, manifeste, refus des symlinks sortants et aucun socket Docker.

## 26. Feature flags et rollout

Flags proposés :

- `WORK_CONTROL_PLANE_ENABLED` ;
- `WORK_EDGE_EXECUTOR_ENABLED` ;
- `WORK_RUN_PLANS_ENABLED` ;
- `WORK_INTERVENTIONS_ENABLED` ;
- `WORK_AUTOMATIONS_ENABLED` ;
- `WORK_AGENT_TEAMS_ENABLED`.

Rollout :

1. tests locaux avec Hermes Docker ;
2. workspace interne canary ;
3. installation distante directe ;
4. installation distante Relay ;
5. migration d'un workspace existant ;
6. activation progressive ;
7. suppression du parcours legacy après période d'observation.

Chaque flag possède un rollback qui arrête les nouveaux enqueues sans supprimer les tâches ou runs existants. Les runs actifs restent consultables et peuvent être annulés par un Owner.

## 27. Décisions actées par ce PRD

- Travail devient un véritable domaine produit et non un lanceur de prompts.
- Une tâche métier et un run d'exécution sont séparés.
- L'Edge remplace tout besoin de daemon supplémentaire.
- Hermes reste l'unique moteur d'exécution.
- Next.js/PostgreSQL restent l'autorité produit et de gouvernance.
- Les commentaires, mentions, projets, équipes, Inbox et automatisations font partie de la cible, pas d'une intégration externe.
- Les validations Hermes sont conservées et renforcées par un modèle générique d'interventions.
- Les fichiers et connaissances deviennent des ressources de travail.
- Le chat privé et Travail restent deux surfaces complémentaires.
- Le plan `todo` d'un run, les runs délégués et les tâches métier sont trois niveaux distincts.
- Le plan vivant utilise le `todo` Hermes existant ; la Console en conserve une projection durable sans dupliquer l'outil.
- La preuve principale de succès est une exécution complète et récupérable sans navigateur ouvert.
