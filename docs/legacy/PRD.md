# PRD — Hermes Console

## Control plane pour connecter, déployer et exploiter Hermes Agent

- Statut : proposition v0.1
- Date : 15 juillet 2026
- Propriétaire produit : Hermes Console
- Portée : produit cible et séquencement MVP
- Documents liés : `PRODUCT.md`, `DESIGN.md`, `README.md`

## 1. Résumé exécutif

Hermes Console évolue d'un cockpit web lié à une installation Hermes locale vers un control plane capable de :

1. utiliser un runtime Hermes local géré par Docker ;
2. se connecter à un runtime Hermes déjà installé sur une autre machine ou un VPS ;
3. provisionner un nouveau VPS sous un budget défini, y installer Hermes et l'enrôler automatiquement ;
4. exploiter plusieurs installations depuis une même Console sans exposer directement Hermes à Internet.

L'utilisateur retrouve la même expérience produit — agents, conversations, tâches, outils, connaissances, channels, approbations et coûts — quel que soit l'emplacement du runtime.

La frontière runtime est un composant Go unique décliné en deux rôles :

- **Edge Gateway** : installé à côté de chaque runtime Hermes ;
- **Relay** : optionnel côté Console déployée, pour recevoir les tunnels sortants des Edge Gateways.

Next.js reste l'autorité du produit, de l'authentification, du RBAC et de PostgreSQL. Hermes reste l'autorité de l'exécution et des conversations.

## 2. Vision

> Connectez un Hermes existant ou déployez une nouvelle installation dans votre budget, puis pilotez tous vos agents depuis une Console unique.

Hermes Console doit masquer la complexité de la CLI, des profils, du réseau, des conteneurs et du provisionnement sans masquer les conséquences opérationnelles importantes : coût, permissions, capacité, état, exposition réseau et responsabilité de gestion.

## 3. Architecture produit cible

```text
╔══════════════════════════════ Hermes Console ══════════════════════════════╗
║ ┌────────────┐  HTTPS : produit/RBAC  ┌─────────────────────────────────┐ ║
║ │ Navigateur │ ──────────────────────▶ │ Next.js + PostgreSQL            │ ║
║ └─────┬──────┘                         └──────────────┬──────────────────┘ ║
║       │ WS : ticket court                            │ HTTP : scope signé   ║
║       ▼                                              ▼                     ║
║ ┌───────────────────────────────────────────────────────────────────────┐ ║
║ │ Go Relay — recommandé en SaaS, omis lorsque le mode direct suffit    │ ║
║ └──────────────────────────────────┬────────────────────────────────────┘ ║
╚════════════════════════════════════│══════════════════════════════════════╝
                                     │ tunnel sortant : mTLS / flux multiplexé
                                     ▼
╔════════════════════════ Installation Hermes locale ou distante ═══════════╗
║ ┌───────────────────────────────────────────────────────────────────────┐ ║
║ │ Go Edge Gateway                                                      │ ║
║ │ identité machine / profil forcé / HTTP+WS / événements / health      │ ║
║ └──────────────────────────────────┬────────────────────────────────────┘ ║
║                                    │ HTTP+WS : token runtime             ║
║                                    ▼                                     ║
║ ┌───────────────────────────────────────────────────────────────────────┐ ║
║ │ Hermes Agent                                                         │ ║
║ │ installation existante OU conteneur Docker multi-profils             │ ║
║ └──────────────────┬───────────────────────────┬────────────────────────┘ ║
║                    │ volume : état             │ montage : fichiers permis ║
║                    ▼                           ▼                          ║
║           ┌─────────────────┐        ┌─────────────────────┐             ║
║           │ profils/sessions│        │ workspaces autorisés│             ║
║           └─────────────────┘        └─────────────────────┘             ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

Légende : le mode direct omet le Relay et joint l'Edge Gateway sur un réseau privé ; le mode relay ne nécessite aucune connexion entrante vers le VPS.

Composants : interface web, backend produit, Relay Go, Edge Gateway Go, Hermes Agent et stockage runtime.

## 4. Problème utilisateur

Aujourd'hui, exploiter Hermes depuis la Console suppose implicitement que :

- Hermes est installé sur la même machine ;
- son endpoint est connu globalement par variables d'environnement ;
- les commandes système et chemins de profils sont disponibles sur l'hôte ;
- un broker local peut démarrer et arrêter Hermes ;
- une seule installation est pilotée à la fois.

Ce modèle bloque trois usages :

- un utilisateur possède déjà un ou plusieurs VPS Hermes et veut les centraliser ;
- une équipe veut déployer Hermes sans apprendre Docker, SSH ou la CLI ;
- une Console SaaS doit piloter des runtimes derrière NAT ou firewall sans exposer `:9119`.

## 5. Utilisateurs cibles

### 5.1 Owner technique

Connecte ou déploie une installation, configure les secrets, budgets, workspaces, mises à jour et politiques réseau.

### 5.2 Opérateur

Surveille l'état, reprend les sessions, traite les incidents et lance les opérations autorisées sans accéder aux secrets d'infrastructure.

### 5.3 Membre métier

Utilise les agents, conversations, tâches et validations sans connaître l'emplacement du runtime.

### 5.4 Viewer / auditeur

Consulte l'activité, les coûts, la santé et l'historique sans modifier le runtime.

### 5.5 Administrateur de plateforme

Dans une Console déployée, supervise les installations de plusieurs organisations, les versions compatibles, le Relay et les incidents globaux.

## 6. Concepts produit

### 6.1 Installation Hermes

Ressource représentant un runtime Hermes joignable par un Edge Gateway. Une installation peut héberger plusieurs profils Hermes, donc plusieurs agents produit.

### 6.2 Origine

- `local_managed` : créée localement par Hermes Console avec Docker ;
- `remote_existing` : Hermes existait avant la Console, systemwide ou sous Docker ;
- `remote_provisioned` : VPS et runtime créés depuis la Console.

### 6.3 Niveau de gestion

- `external` : la Console observe et utilise Hermes mais ne gère pas son lifecycle ;
- `connected` : la Console peut configurer les profils et redémarrer les gateways Hermes ;
- `managed` : la Console gère également déploiement, upgrade, rollback, sauvegarde et restauration.

Une installation existante doit être `external` par défaut. Chaque capacité destructive ou d'administration est activée explicitement.

### 6.4 Transport

- `direct` : la Console joint l'Edge Gateway via loopback, WireGuard, Tailscale ou réseau privé ;
- `relay` : l'Edge Gateway ouvre une connexion sortante persistante vers le Relay de la Console.

### 6.5 Agent

Objet produit lié à un profil Hermes et à une installation précise. Deux agents d'un même workspace peuvent, à terme, vivre sur des installations différentes.

## 7. Proposition de valeur

### Connecter

Ajouter en quelques minutes un VPS où Hermes fonctionne déjà, sans réinstaller ni migrer immédiatement son état.

### Déployer

Choisir un budget et une charge cible, obtenir une proposition de VPS, puis laisser la Console provisionner et enrôler Hermes.

### Exploiter

Centraliser agents, conversations, channels, coûts, santé, mises à jour, sauvegardes et opérations.

### Gouverner

Appliquer un RBAC produit, des budgets, des limites de capacité et une piste d'audit sur des runtimes distribués.

## 8. Parcours principaux

### 8.1 Connecter un Hermes distant existant

```text
┌──────────────────────┐  saisie : mode/endpoint  ┌────────────────────────┐
│ Assistant Connecter  │ ────────────────────────▶ │ Test réseau et identité│
└──────────────────────┘                           └────────────┬───────────┘
                                                              │ API : capabilities
                                                              ▼
┌──────────────────────┐  validation : profils/version ┌────────────────────┐
│ Installation créée   │ ◀──────────────────────────── │ Préflight Hermes   │
└──────────┬───────────┘                               └────────────────────┘
           │ association : agent/profil
           ▼
┌──────────────────────┐
│ Console opérationnelle│
└──────────────────────┘
```

Légende : le préflight ne modifie pas Hermes ; les droits de gestion sont accordés après connexion.

Composants : assistant, Edge Gateway, Hermes existant et installation produit.

Étapes :

1. choisir `Hermes existant` ;
2. sélectionner connexion directe ou relay ;
3. installer/enrôler l'Edge Gateway si absent ;
4. vérifier identité, version, contrat API, profils, stockage et permissions ;
5. nommer l'installation et choisir son niveau de gestion ;
6. importer ou associer les profils aux agents produit ;
7. ouvrir le dashboard de l'installation.

Cas supportés :

- Hermes systemwide : Edge Gateway sur le même VPS, upstream loopback `127.0.0.1:9119` ;
- Hermes Docker : Edge Gateway sidecar sur le même réseau Docker, upstream `hermes:9119` ;
- réseau privé existant : mode direct ;
- VPS derrière firewall/NAT : mode relay sortant.

### 8.2 Amorcer une connexion distante par environnement

Pour une Console locale mono-installation, des variables serveur peuvent amorcer une installation par défaut :

```dotenv
HERMES_DEFAULT_GATEWAY_MODE=direct
HERMES_DEFAULT_GATEWAY_URL=https://hermes-edge.example.internal
HERMES_DEFAULT_GATEWAY_CA_FILE=/run/secrets/hermes-edge-ca.pem
HERMES_DEFAULT_GATEWAY_CLIENT_CERT_FILE=/run/secrets/hermes-console-client.pem
HERMES_DEFAULT_GATEWAY_CLIENT_KEY_FILE=/run/secrets/hermes-console-client-key.pem
```

Règles :

- aucune valeur sensible ne porte le préfixe `NEXT_PUBLIC_` ;
- l'environnement sert au bootstrap, pas de modèle permanent pour le multi-runtime ;
- au premier démarrage, la Console crée ou réconcilie une installation en base ;
- la configuration UI prend ensuite le relais ;
- les mêmes variables peuvent amorcer une Console déployée si elle possède une route privée vers l'Edge ;
- sans connectivité privée directe, une Console déployée privilégie le Relay et l'enrôlement plutôt qu'un endpoint public.

### 8.3 Déployer une nouvelle installation sur VPS

1. choisir fournisseur, région et budget mensuel maximum ;
2. sélectionner charge légère, standard ou intensive ;
3. consulter coût infra estimé, capacité et limites ;
4. fournir un accès fournisseur ou une machine existante ;
5. provisionner le VPS ;
6. installer Docker et déployer Hermes + Edge Gateway ;
7. enrôler le gateway avec un jeton à usage unique ;
8. exécuter les healthchecks ;
9. créer le premier profil/agent ;
10. afficher coût, état et procédure de rollback.

### 8.4 Lancer Hermes localement

1. détecter Docker ;
2. créer le volume persistant ;
3. démarrer Hermes et l'Edge Gateway avec Compose ;
4. attendre les healthchecks ;
5. importer facultativement un profil systemwide existant ;
6. ne désactiver l'installation systemwide qu'après validation.

### 8.5 Console déployée avec runtimes distribués

1. l'Owner génère un jeton d'enrôlement court ;
2. l'Edge Gateway échange le jeton contre une identité machine ;
3. l'Edge ouvre un tunnel sortant mTLS vers le Relay ;
4. le Relay associe la connexion à l'installation et au tenant ;
5. Next émet des tickets courts, limités au profil et au rôle ;
6. le Relay multiplexe HTTP, WebSocket et événements vers le bon Edge ;
7. la révocation de l'installation ferme le tunnel et invalide les tickets.

## 9. Exigences fonctionnelles

### 9.1 Inventaire des installations — P0

- créer, nommer, modifier et archiver une installation ;
- afficher origine, niveau de gestion, transport, version et dernière activité ;
- afficher états `online`, `degraded`, `offline`, `upgrading`, `revoked` ;
- associer agents et profils à une installation ;
- filtrer les installations par tenant, workspace, état et version ;
- interdire toute fuite inter-tenant.

### 9.2 Edge Gateway Go — P0

- remplacer intégralement le broker Bun ;
- exposer HTTP et WebSocket via un contrat versionné ;
- vérifier tickets HMAC ou identités mTLS ;
- forcer le profil autorisé sur chaque requête ;
- appliquer les permissions viewer/member/owner ;
- garder le token Hermes exclusivement sur l'hôte runtime, sous la responsabilité de l'Edge ;
- normaliser timeouts, erreurs et reconnexions ;
- diffuser les invalidations de sessions sans polling périodique ;
- annoncer version, capacités, runtime cible et état ;
- supporter upstream Hermes loopback, réseau Docker ou URL privée ;
- refuser les upstream non autorisés et les changements de cible à chaud non signés.

### 9.3 Relay Go — P0 pour Console SaaS multi-tenant

- accepter uniquement les Edge Gateways enrôlés ;
- maintenir les tunnels sortants avec reconnexion et backoff ;
- multiplexer les flux par tenant, installation, profil et session ;
- router les requêtes serveur et les WebSockets navigateur ;
- appliquer quotas, limites de trames et backpressure ;
- ne jamais déchiffrer ou journaliser les secrets métier ;
- fermer immédiatement une installation révoquée ;
- exposer métriques techniques et healthchecks.

Le Relay et l'Edge peuvent être deux modes du même binaire Go et partager protocole, types et primitives de sécurité.

### 9.4 Connexion d'un runtime existant — P0

- assistant direct/relay ;
- préflight non destructif ;
- détection Hermes systemwide ou Docker ;
- vérification de compatibilité du contrat runtime ;
- découverte des profils ;
- choix explicite des capacités de gestion ;
- import/association sans duplication des conversations ;
- test de chat contrôlé avant passage à `ready` ;
- procédure de déconnexion réversible.

### 9.5 Runtime Docker local — P1

- image Hermes officielle épinglée par version ou digest ;
- un conteneur Hermes multi-profils par installation, conformément à la recommandation Docker officielle depuis la supervision s6 ;
- `:9119` non publié hors réseau runtime ;
- volume persistant séparé du code de l'image ;
- workspaces montés explicitement ;
- limites CPU/RAM ;
- healthchecks et logs ;
- aucune suppression de volume lors d'un simple `fresh`.

### 9.6 Provisionnement VPS — P1

- catalogue d'offres et prix actualisés ;
- plafond mensuel strict sur l'offre sélectionnée ;
- fournisseur, région, image, stockage et réseau configurables ;
- bootstrap par API fournisseur, cloud-init ou SSH ;
- installation Docker idempotente ;
- Compose versionné ;
- journal d'étapes avec reprise après erreur ;
- cleanup sûr d'un provisionnement échoué ;
- support BYOVPS avant revente d'infrastructure.

### 9.7 Lifecycle managé — P1

- démarrage, arrêt, restart et drain ;
- upgrade vers une version autorisée ;
- préflight avant upgrade ;
- sauvegarde avant mutation ;
- rollback applicatif et restauration des données ;
- rotation de l'identité Edge ;
- historique d'opérations avec initiateur, résultat et durée.

### 9.8 Budgets et coûts — P1

- budget infrastructure et budget inférence séparés ;
- plafond global optionnel ;
- coûts étiquetés `estimé`, `provider-reported` ou `facturé` ;
- alertes configurables ;
- soft cap et hard cap ;
- action explicite au hard cap : pause, validation Owner ou modèle de repli ;
- aucune promesse de coût exact lorsque la source fournisseur ne le permet pas.

### 9.9 Capacité — P1

- afficher CPU, RAM, disque et sessions actives ;
- distinguer nombre de profils et concurrence active ;
- mesurer les charges lourdes : navigateur, MCP, cron et sous-agents ;
- conserver un seuil de headroom ;
- prévenir avant de créer une charge dépassant la capacité ;
- recommander un redimensionnement sans l'exécuter sans confirmation.

### 9.10 Sauvegarde et restauration — P2

- sauvegarde chiffrée du volume Hermes ;
- politique de rétention ;
- restauration vers la même installation ou une nouvelle ;
- contrôle d'intégrité ;
- test périodique de restaurabilité ;
- exclusion ou traitement explicite des secrets selon politique.

## 10. Modèle de données conceptuel

### `runtime_installations`

- `id`, `tenant_id`, `name` ;
- `origin`, `management_level`, `transport` ;
- `status`, `status_reason`, `last_seen_at` ;
- `gateway_protocol_version`, `hermes_version` ;
- `endpoint` non secret ou identifiant relay ;
- `provider`, `provider_resource_id`, `region` ;
- `created_by_user_id`, timestamps.

### `runtime_identities`

- identité publique de l'Edge ;
- empreinte certificat ;
- statut et date d'expiration ;
- dates de rotation/révocation ;
- aucune clé privée stockée en clair.

### `runtime_capabilities`

- endpoints et méthodes supportés ;
- capacités de gestion accordées ;
- version du contrat ;
- date de dernière négociation.

### `runtime_operations`

- type, statut, initiateur ;
- installation, version source/cible ;
- étapes, timestamps, erreur normalisée ;
- référence backup/rollback.

### `runtime_budgets`

- période et devise ;
- plafond infra, inférence et global ;
- seuils d'alerte ;
- comportement soft/hard cap.

### `runtime_usage_samples`

- CPU, RAM, disque, profils, sessions concurrentes ;
- coûts estimés et remontés ;
- source, fenêtre temporelle et niveau de confiance.

### Évolution de `agents`

- ajouter `runtime_installation_id` ;
- conserver `hermes_profile_name` unique dans le périmètre de l'installation, pas globalement ;
- toute requête runtime résout l'installation puis le profil avant émission d'un ticket.

## 11. Contrat de connectivité

### Handshake Edge

L'Edge annonce :

- identité et installation ;
- version du protocole Gateway ;
- version Hermes ;
- modes HTTP/WS disponibles ;
- capacités runtime et lifecycle ;
- profils visibles uniquement après autorisation.

Le serveur répond :

- protocole accepté ou erreur de compatibilité ;
- tenant et installation autorisés ;
- limites de débit et taille ;
- configuration de heartbeat ;
- capacités temporairement désactivées.

### Compatibilité

- protocole Gateway versionné indépendamment de Hermes ;
- matrice de versions supportées ;
- mode lecture seule lorsque Hermes est trop ancien pour les mutations ;
- message d'upgrade explicite ;
- aucun contournement silencieux du profil ou du RBAC.

### API

Le Gateway ne doit pas être un reverse proxy arbitraire. Les routes Hermes autorisées sont déclarées, typées ou allowlistées. Toute route destructive exige une capacité et un rôle explicites.

## 12. Sécurité et conformité

### Invariants

- Hermes `:9119` n'est jamais exposé publiquement par défaut ;
- le navigateur ne reçoit jamais le token Hermes ;
- les secrets distants ne sont jamais placés dans `NEXT_PUBLIC_*` ;
- l'Edge force le profil à partir de l'autorisation signée ;
- aucune installation ne peut choisir tenant, workspace ou profil hors ticket ;
- aucun socket Docker n'est monté dans Hermes ou l'Edge ;
- aucun montage global de `/home`, `~/.ssh` ou `~/.config` ;
- les workspaces sont allowlistés et read-only par défaut ;
- toute opération destructive est auditée et confirmée.

### Enrôlement

- jeton à usage unique, durée courte, stocké hashé ;
- échange contre certificat/identité machine ;
- rotation et révocation ;
- protection contre replay ;
- affichage d'une empreinte vérifiable à l'Owner.

### Connexion directe

- HTTPS/WSS obligatoire hors loopback ;
- mTLS ou réseau privé recommandé ;
- validation stricte du certificat et de l'hostname ;
- protection SSRF et interdiction des plages/cibles non autorisées selon le contexte de déploiement.

### Accès fournisseur et SSH

- privilégier les tokens fournisseur à portée minimale ;
- ne pas conserver un accès SSH permanent si le bootstrap peut utiliser une clé éphémère ;
- chiffrer les secrets au repos avec séparation clé/données ;
- ne jamais renvoyer les secrets au navigateur après enregistrement.

### Egress agent

- politique configurable ;
- possibilité de proxy allowlist ;
- séparation réseau entre contrôle et egress ;
- avertissement explicite lorsqu'un runtime utilise `network_mode: host` ou un Docker socket.

## 13. Permissions

| Action | Viewer | Member | Owner | Admin plateforme |
|---|---:|---:|---:|---:|
| Voir santé et coûts | Oui | Oui | Oui | Selon délégation |
| Utiliser un agent | Non | Oui | Oui | Non par défaut |
| Approuver une action agent | Non | Selon policy | Oui | Non par défaut |
| Connecter une installation | Non | Non | Oui | Oui avec mandat |
| Modifier secrets/runtime | Non | Non | Oui | Non par défaut |
| Provisionner un VPS | Non | Non | Oui | Oui avec mandat |
| Upgrade/rollback | Non | Non | Oui | Oui avec mandat |
| Révoquer une installation | Non | Non | Oui | Oui avec mandat |

Les rôles produit ne donnent jamais implicitement accès au contenu d'un autre tenant ni aux secrets d'infrastructure.

## 14. UX et navigation

### Nouvelle surface `Installations`

Vue liste :

- nom, emplacement, mode, version ;
- état et dernière activité ;
- agents/profils associés ;
- capacité et budget ;
- prochaine action requise.

Vue détail :

- résumé de santé ;
- connectivité ;
- agents et profils ;
- capacité ;
- coûts ;
- opérations ;
- sauvegardes ;
- sécurité ;
- journal d'audit.

### Actions primaires

- `Connecter un Hermes existant` ;
- `Déployer sur un VPS` ;
- `Lancer localement`.

Le produit ne doit pas exposer Docker, s6, mTLS ou les profils comme vocabulaire principal. Ces informations restent disponibles dans les détails techniques.

## 15. États et erreurs

### États installation

- `pending_enrollment` ;
- `checking` ;
- `ready` ;
- `degraded` ;
- `offline` ;
- `incompatible` ;
- `upgrading` ;
- `rollback_required` ;
- `revoked`.

### Principes d'erreur

- distinguer réseau, identité, compatibilité, runtime et profil ;
- afficher la dernière preuve de santé et son horodatage ;
- ne pas présenter une donnée en cache comme actuelle ;
- proposer une action sûre et contextualisée ;
- conserver le détail technique copiable sans exposer de secret.

## 16. Budgets et modèle commercial

### Phase initiale : BYOVPS

L'utilisateur paie directement son fournisseur. Hermes Console facture le logiciel/control plane. Cette phase réduit les risques de revente, marge, fiscalité et dépassement d'infrastructure.

### Phase ultérieure : managé

Hermes Console peut provisionner et refacturer l'infrastructure dans un forfait intégrant :

- VPS et stockage ;
- sauvegardes ;
- niveau de service ;
- capacité active ;
- éventuelle enveloppe d'inférence.

Le nombre d'agents ne doit pas être l'unique unité tarifaire. La concurrence active et les charges lourdes sont de meilleurs indicateurs de capacité.

## 17. Non-objectifs initiaux

- remplacer les fournisseurs cloud par un orchestrateur généraliste ;
- supporter tous les VPS dès le MVP ;
- exposer directement l'API Hermes sur Internet ;
- déplacer automatiquement un Hermes existant vers Docker sans validation ;
- promettre un nombre fixe d'agents uniquement selon les vCPU ;
- revendre l'infrastructure dès la première version ;
- fournir Kubernetes avant que Compose et le VPS unique soient validés ;
- donner au Gateway un accès arbitraire au backend produit ou à PostgreSQL.

## 18. Séquencement

### Phase 0 — Parité Gateway Go

- porter le broker Bun en Go ;
- conserver chat, tickets, profil forcé et invalidations ;
- ajouter contrat HTTP ;
- supprimer tout accès Next direct à Hermes ;
- valider la parité locale réelle.

### Phase 1 — Connecter un Hermes existant

- modèle `runtime_installations` ;
- Edge direct ;
- bootstrap `.env` serveur ;
- préflight et découverte de profils ;
- association agents/installations ;
- support Hermes systemwide et Docker ;
- déconnexion/révocation.

Cette phase délivre la valeur distante avant d'automatiser le provisionnement.

### Phase 2 — Relay et Console déployée

- mode Edge sortant ;
- Relay Go ;
- enrôlement, rotation et révocation ;
- multiplexage HTTP/WS ;
- observabilité et limites.

### Phase 3 — Hermes Docker local managé

- Compose projet ;
- volume, réseau privé et mounts ;
- import contrôlé du systemwide ;
- lifecycle et rollback ;
- suppression de la dépendance Hermes hôte.

### Phase 4 — Provisionnement BYOVPS

- premier fournisseur ;
- catalogue/pricing ;
- cloud-init/SSH idempotent ;
- budget infra ;
- installation et enrôlement automatique ;
- cleanup et reprise.

### Phase 5 — Coûts, backups et offre managée

- budgets inférence ;
- facturation ;
- sauvegardes/restaurations ;
- upgrades orchestrés ;
- offre managée et isolation premium.

## 19. Critères d'acceptation MVP distant

### Scénario A — Console locale vers VPS existant

- un Owner configure un Edge distant par environnement ou assistant ;
- le préflight confirme version et profils ;
- un agent est associé à un profil existant ;
- chat, streaming, historique et métriques fonctionnent ;
- aucune requête navigateur ne contient le token Hermes ;
- le runtime se reconnecte après coupure.

### Scénario B — Console déployée vers VPS privé

- l'Edge s'enrôle avec un jeton court ;
- il ouvre uniquement une connexion sortante ;
- le Relay route les flux du bon tenant et profil ;
- la révocation coupe la connexion ;
- `:9119` n'est pas accessible publiquement.

### Scénario C — Hermes existant non managé

- la Console ne redémarre ni ne met à jour Hermes sans capacité explicite ;
- les actions interdites sont absentes ou désactivées avec explication ;
- la déconnexion ne supprime aucune donnée Hermes.

### Scénario D — Compatibilité insuffisante

- le préflight identifie la version incompatible ;
- la Console reste en lecture seule lorsque possible ;
- une procédure d'upgrade est proposée sans exécution automatique.

### Scénario E — Isolation

- un ticket du tenant A ne peut joindre aucune installation ou profil du tenant B ;
- un viewer ne peut envoyer de mutation ;
- une modification manuelle de `profile` est écrasée ou rejetée par l'Edge.

## 20. Métriques de succès

- temps médian pour connecter un Hermes existant ;
- taux de préflights réussis ;
- taux d'installations devenant `ready` sans intervention CLI ;
- stabilité des tunnels et temps de reconnexion ;
- taux de sessions sans erreur de routage ;
- nombre d'incidents d'isolation ou secrets exposés : zéro attendu ;
- taux d'opérations avec rollback disponible ;
- écart entre coût estimé et coût remonté, avec source clairement libellée ;
- adoption des modes local, distant existant et provisionné.

## 21. Validation requise avant lancement

- tests unitaires du protocole, HMAC, mTLS, scopes et allowlists ;
- tests d'intégration Edge ↔ Hermes systemwide ;
- tests d'intégration Edge ↔ Hermes Docker ;
- E2E navigateur sur mode direct et relay ;
- coupures réseau, reconnexion et backpressure ;
- rotation/révocation des identités ;
- test de non-régression du chat et des invalidations ;
- test multi-tenant négatif ;
- upgrade/rollback sur copie de données ;
- audit de secrets et SSRF ;
- test réel sur au moins un VPS avant ouverture du provisionnement.

## 22. Risques

### Compatibilité Hermes

Le contrat Hermes évolue. Mitigation : protocole Gateway versionné, capability negotiation et matrice de compatibilité.

### Tunnel central

Le Relay devient critique pour la Console déployée. Mitigation : reconnexion, réplication ultérieure, métriques, limites et dégradation explicite.

### Coûts imprévisibles

Le VPS ne borne pas l'inférence. Mitigation : budgets séparés, provenance des coûts et hard caps explicites.

### Accès machine

Un agent avec workspace ou Docker socket trop large compromet l'hôte. Mitigation : mounts minimaux, aucun socket Docker, egress contrôlé et avertissements.

### Migration systemwide vers Docker

Les chemins, plugins et credentials peuvent diverger. Mitigation : import copié, validation avant bascule et rollback vers l'installation originale.

### Provisionnement partiellement échoué

Des ressources payantes peuvent rester actives. Mitigation : opérations idempotentes, inventaire des ressources créées, cleanup et alerte.

## 23. Décisions ouvertes

1. Le Relay est-il intégré au même déploiement que Next ou opéré comme service séparé ?
2. Quel premier fournisseur VPS supporte le provisionnement automatisé ?
3. API directe, OpenTofu, Ansible ou outil interne pour le provisionnement ?
4. Quel tunnel privé par défaut : mTLS applicatif, WireGuard ou les deux ?
5. Quel stockage chiffré pour les identités et credentials fournisseur ?
6. Quelles versions Hermes constituent la première matrice supportée ?
7. Quels endpoints Hermes sont P0 dans l'allowlist Gateway ?
8. Quelle politique de hard cap doit interrompre ou dégrader une session active ?
9. Quelle granularité de montage workspace est compréhensible sans exposer la complexité Docker ?
10. À quel moment une installation `external` peut devenir `managed` ?

## 24. Décision produit proposée

Valider le produit cible complet, mais construire dans cet ordre :

1. Gateway Go et contrat unique ;
2. connexion à un Hermes distant existant ;
3. Relay pour Console déployée ;
4. runtime Docker local managé ;
5. provisionnement VPS BYOVPS ;
6. coûts avancés et offre managée.

Cet ordre transforme l'architecture sans attendre le provisionnement pour délivrer la première valeur distante, et garantit que le même protocole sert ensuite le local, l'existant et le nouveau VPS.

## 25. Références Hermes vérifiées

- Docker : https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/docker.md
- Compose officiel : https://github.com/NousResearch/hermes-agent/blob/main/docker-compose.yml
- Dockerfile officiel : https://github.com/NousResearch/hermes-agent/blob/main/Dockerfile
- Support plateformes : https://hermes-agent.nousresearch.com/docs/getting-started/platform-support
- Image publiée : https://hub.docker.com/r/nousresearch/hermes-agent/tags
