# Matrice d’exécution du PRD Hermes Console

Date d’audit : 15 juillet 2026  
Branche : `feature/local-runtime-control-plane`

Cette matrice empêche de confondre un socle vert avec l’exécution complète du PRD. Un élément est `prouvé` seulement lorsqu’un artefact et un test proportionné existent. `VPS différé` signifie que l’implémentation locale peut être terminée, mais que sa preuve sur une machine distante réelle appartient explicitement au second lot demandé.

```text
╔══════════════════════════════ Sources de vérité ═════════════════════════════╗
║ PRD ──exigence──▶ code/migration ──preuve locale──▶ test unitaire/intégration║
║                                              │                              ║
║                                              └──preuve distante──▶ VPS différé║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

Légende : `✅` prouvé, `🟡` partiel/en cours, `⬜` absent, `🌐` preuve VPS différée.  
Composants : PRD, code produit, migrations, tests locaux et validation VPS.

## Exigences fonctionnelles

| Réf. | Exigence | État | Preuve ou écart restant |
|---|---|---:|---|
| 9.1 | Créer une installation | ✅ | Assistant + préflight séparé + insertion transactionnelle |
| 9.1 | Modifier, archiver et reconnecter | ✅ | API tenant-scoped, déconnexion sans suppression Hermes, détail UI |
| 9.1 | États, version et dernière activité | ✅ | Schéma complet et vues liste/détail |
| 9.1 | Association agent/profil | ✅ | Profils découverts uniquement, unicité par installation |
| 9.1 | Filtres et isolation tenant/workspace | ✅ | Nom, état, version, workspace ; E2E négatif inter-tenant et filtre workspace |
| 9.2 | Edge Go unique HTTP/WS | ✅ | Ancien bridge Bun supprimé, contrat version 1 |
| 9.2 | HMAC, profil forcé, RBAC, allowlist | ✅ | Tests Go auth/policy/proxy |
| 9.2 | Identité mTLS alternative | ✅ | Clé privée générée sur l’Edge, certificat lié au credential, rotation/révocation |
| 9.2 | Reconnexion, quotas et backpressure complets | ✅ | Backoff, heartbeat, limites globales/tenant/trames et 256 requêtes en vol |
| 9.2 | Handshake version/capacités/runtime | ✅ | `/v1/capabilities` + `/v1/preflight` signé |
| 9.3 | Relay Go sortant multi-tenant | ✅ local / 🌐 VPS | Même binaire Go, tunnel WSS mTLS, multiplexage HTTP/WS, métriques sans labels tenant |
| 9.4 | Assistant direct/relay | ✅ | Préflight direct en deux étapes et commande d’enrôlement Relay à usage unique |
| 9.4 | Préflight, compatibilité, détection et profils | ✅ | Préflight signé, lecture seule incompatible, données sensibles filtrées |
| 9.4 | Choix des capacités | ✅ | `external` par défaut, `connected` seulement si lifecycle annoncé |
| 9.4 | Test chat contrôlé avant ready | ✅ | Session éphémère créée avec profil forcé puis supprimée avant validation |
| 9.4 | Déconnexion réversible | ✅ | Archivage/révocation locale, données Hermes intactes, reconnexion par préflight |
| 9.5 | Image officielle épinglée, réseau privé, volume, limites | ✅ | Compose et smoke réel de l’image officielle |
| 9.5 | Workspaces montés explicitement read-only par défaut | ✅ | Aucun home implicite ; chemin opt-in partagé Edge/Hermes, lecture seule par défaut |
| 9.5 | Import systemwide contrôlé et rollback | ✅ | Copie atomique allowlistée, secrets opt-in, manifeste SHA-256, rollback vérifié |
| 9.6 | Provisionnement BYOVPS | 🌐 | Implémentation et tests réels réservés au second lot VPS |
| 9.7 | Start/restart | ✅ | API officielle Hermes authentifiée et smoke réel |
| 9.7 | Stop/drain, upgrade, backup, rollback, rotation | ✅ local / 🌐 exécuteur VPS | Opérations auditées, confirmées, capability-gated ; copie de données testée |
| 9.8 | Budgets/coûts/caps | ✅ | Budgets séparés, provenance/devise, soft/hard caps, pause/Owner/modèle de repli forcé |
| 9.9 | Capacité et headroom | ✅ | CPU/RAM/disque/profils/sessions/charges, seuils persistés, blocage et recommandation |
| 9.10 | Backup chiffré/restauration/intégrité | ✅ | AES-GCM, rétention, vérification, restauration même/nouvelle installation et secrets explicites |

## Modèle de données

| Ressource PRD | État |
|---|---:|
| `runtime_installations` | ✅ |
| `runtime_identities` | ✅ lifecycle complet, rotation et révocation |
| `runtime_enrollment_tokens` | ✅ hash, expiration, consommation atomique et révocation |
| `runtime_capabilities` | ✅ et alimenté par préflight |
| `runtime_operations` | ✅ API/UI, initiateur, étapes, durée et erreurs |
| `runtime_budgets` | ✅ API/UI et enforcement à l’émission du ticket |
| `runtime_usage_samples` | ✅ collecte capacité/coût, source, devise et confiance |
| `runtime_backups` | ✅ moteur Edge, API/UI, rétention et maintenance périodique |
| `agents.runtime_installation_id` + unicité profil | ✅ |

## Validation requise

| Validation PRD | État |
|---|---:|
| Protocole, HMAC, scopes et allowlists | ✅ local |
| Edge ↔ Hermes Docker officiel | ✅ local réel |
| Edge ↔ Hermes systemwide | ✅ contrat/Compose local ; 🌐 preuve sur hôte VPS différée |
| E2E navigateur direct | ✅ |
| E2E navigateur relay | ✅ navigateur WSS + intégration Relay mTLS réelle |
| Coupure réseau, reconnexion, quotas/backpressure | ✅ Go avec race detector |
| Rotation/révocation des identités | ✅ consommation atomique + fermeture du tunnel + persistance |
| Non-régression chat/invalidation | ✅ |
| Isolation multi-tenant négative | ✅ API/E2E + tickets/credentials liés à l’installation |
| Upgrade/rollback sur copie de données | ✅ exécuteur sans shell + backup/restauration testés |
| Audit secrets et SSRF | ✅ aucun secret public/direct Hermes ; allowlist URL ; secrets dev refusés en production |
| VPS réel | 🌐 second lot uniquement |

## Preuve locale finale

| Commande | Résultat |
|---|---:|
| `go test -race ./gateway/... ./cmd/...` | ✅ 30 tests Go |
| `go vet ./gateway/... ./cmd/...` | ✅ |
| `bun run test` | ✅ 62 tests unitaires TypeScript |
| `bun run typecheck` | ✅ |
| `bun run lint` | ✅ 0 erreur ; 42 avertissements historiques hors lot |
| `bun run build` | ✅ build Next.js 16.2.10 |
| `bun run test:e2e` | ✅ 31 scénarios navigateur |
| `docker compose build edge relay` | ✅ images Go distroless |
| `docker compose up -d --wait hermes edge` | ✅ Hermes officiel `v2026.7.7.2` healthy, Edge `/readyz` ready |
| validation des deux fichiers Compose | ✅ |
| `bun run runtime:maintain-backups` | ✅ maintenance exécutable |

Le lot local ne prétend pas valider ce qui dépend d’un environnement distant réel : connectivité d’un VPS,
certificat public, firewall/NAT, exécuteur de redéploiement Docker et provisionnement fournisseur restent la
phase `🌐` suivante demandée. Toutes ces capacités restent désactivées ou capability-gated lorsqu’elles ne
sont pas configurées.
