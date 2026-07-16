# Work control plane — preuves d'implémentation

Date de l'audit : 2026-07-16
Branche : `feature/work-control-plane-prd`

## Résultat

Le domaine Travail décrit dans `PRD-WORK.md` est implémenté dans Hermes Console : modèle durable, API produit,
contrat Edge signé, exécuteur Go, projection du `todo` Hermes en plans versionnés, interventions, Inbox,
projets, équipes, ressources, dépendances, automatisations, temps réel et interfaces Travail.

Une validation reste dépendante de l'environnement :

1. le test Docker réel atteint bien l'Edge puis Hermes, mais le profil Hermes local ne possède aucun fournisseur
   d'inférence configuré ; il termine donc avec `No inference provider configured` avant de produire le résultat ;

La limite de sélection des sous-agents Hermes natifs est résolue au niveau produit sans attribution fictive : une
équipe peut activer `autoDelegatePlanSteps`. Les étapes `pending` du plan lead créent alors des runs enfants
idempotents ciblant réellement les profils membres. Les sous-agents natifs restent affichés séparément comme
projections synthétiques.

## Preuves par couche

| Couche | Preuve principale |
| --- | --- |
| Domaine | `apps/web/src/modules/work/domain/work.ts` et tests associés |
| Persistance | `apps/web/src/db/schema.ts`, migration additive et triggers PostgreSQL |
| Services produit/runtime | `apps/web/src/modules/work/infrastructure/work-service.ts` et `work-runtime-service.ts` |
| Contrat Edge | `packages/shared/src/gateway.ts` et `packages/shared/gatewaycontracts/contracts.go` |
| Exécution | `apps/gateway/gateway/work_executor.go` |
| UI | routes `tasks`, `projects`, `inbox`, `approvals`, `automations`, `agents` |
| API | routes produit `/api/:tenant/:workspace/work-*` et runtime `/api/runtime/work/*` |
| E2E simulé | `apps/web/e2e/work.spec.ts` |
| E2E Docker réel | `apps/web/e2e/work-real.spec.ts`, activé par `E2E_REAL_WORK=1` |

## Audit des 21 critères d'acceptation

| # | État | Preuve ou limite |
| ---: | --- | --- |
| 1 | Vert | création/assignation API et E2E |
| 2 | Vert | claim transactionnel Edge, intégration PostgreSQL et E2E |
| 3 | Vert côté architecture | le worker est l'Edge ; le test réel ferme le navigateur avant le polling |
| 4 | Bloqué environnement | profil forcé et prompt soumis ; fournisseur d'inférence local absent |
| 5 | Vert | timeline paginée et événements présentés, payload brut filtré |
| 6 | Vert | intervention `approval`, Inbox et Validations testées en E2E |
| 7 | Vert | heartbeat reprend le même run/session et livre la décision |
| 8 | Vert | completion crée commentaire/livrable et état terminal |
| 9 | Vert | leases, idempotence, reprise sans seconde soumission et tests Go |
| 10 | Vert | retry infrastructure reprend la session ; rerun manuel crée une session indépendante |
| 11 | Vert | mentions d'agent et d'équipe testées en intégration |
| 12 | Vert | politique opt-in, run enfant sur le vrai profil membre et chaîne lead/membre visible |
| 13 | Vert | déclencheurs manuel, event, cron et webhook avec historique/idempotence |
| 14 | Vert | guards workspace/RBAC, budget au lancement, profil et ressources sûres |
| 15 | Vert | secrets éphémères, redaction récursive et événements/logs filtrés |
| 16 | Vert au control plane | direct et Relay couverts en intégration ; Relay réel reste un test de déploiement |
| 17 | Vert | migration additive des anciennes tâches et conservation du lien legacy |
| 18 | Vert | SSE, snapshots de plan immuables, reload et état terminal E2E |
| 19 | Vert | mise à jour du `todo` sans création implicite de tâche métier |
| 20 | Vert | promotion explicite idempotente en sous-tâche E2E |
| 21 | Partiel | toutes les suites locales passent ; le test Docker réel attend un fournisseur Hermes |

## Résultats de validation

- TypeScript : vert (`bun run typecheck`).
- Unitaires web : 88 réussis, 1 test PostgreSQL volontairement ignoré sans `DATABASE_URL`.
- Intégration PostgreSQL ciblée : 1 scénario, 78 assertions, vert, dont deux délégations sur des profils membres
  distincts avec une limite d'équipe à deux runs actifs.
- Shared contract : 1 scénario, 7 assertions, vert.
- Go Edge avec race detector : vert.
- Playwright Work : 3 scénarios, vert.
- Build Next.js production : vert ; avertissement NFT préexistant sur le traçage dynamique de l'extension Hermes.
- ESLint : 0 erreur, 41 avertissements préexistants dans les composants Chat.
- Audit architecture : 69 routes API, 28 pages, 375 modules ; vert.
- Baseline de contrat : mise à jour intentionnelle puis vérification verte.
- Compose Hermes/Edge : services démarrés et exécuteur Work actif.
- Docker réel : claim, workdir isolé, manifeste et session Hermes prouvés ; résultat bloqué par la configuration
  d'inférence locale.

## Rollout et exploitation

- Les flags `WORK_*` bloquent les nouveaux enqueues sans supprimer les données existantes.
- Le scheduler externe appelle `/api/internal/work/automations/cron` avec `WORK_AUTOMATION_CRON_SECRET`.
- Les webhooks n'enregistrent que le hash SHA-256 du secret et affichent la valeur une seule fois.
- Le répertoire d'un run reste sous `data/work/workspaces/<workspace>/work/<item>/` et refuse les sorties par
  symlink ou traversal.
- Hermes Agent n'a pas été modifié : la Console et l'Edge consomment uniquement son protocole public.

## Validation réelle à terminer dans un environnement configuré

1. configurer un fournisseur d'inférence dans le profil Hermes `default` ;
2. lancer `E2E_REAL_WORK=1 bun --env-file=../../.env x playwright test work-real.spec.ts` depuis `apps/web` ;
3. exécuter le même scénario sur une installation Relay distante ;
4. vérifier le redémarrage Edge en cours de run et la reprise de la session sur l'infrastructure cible.
