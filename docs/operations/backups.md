# Sauvegardes Postgres de production

## Deux périmètres de sauvegarde distincts

Hermes Console a **deux** systèmes de sauvegarde indépendants, à ne pas confondre :

| | Ce document (`backup-postgres.sh`) | `scripts/maintain-runtime-backups.ts` |
| --- | --- | --- |
| Sauvegarde quoi | Le Postgres produit (tenants, agents, tâches, audit…) de `infra/prod/compose.console.yaml` | Les backups Hermes *runtime* (profils, mémoire, config d'un agent), déclenchés côté Edge |
| Déclenché par | Cron système (ce runbook) | `make runtime-backups-maintain` (vérification/rétention périodique de backups déjà créés depuis la Console) |
| Format | `pg_dump` custom (`.dump`) | Archive chiffrée AES-GCM gérée par l'Edge Go |
| Portée | Toute l'organisation, toute la base | Un profil Hermes à la fois |

Ce runbook ne couvre que le Postgres produit.

## Quoi, quand, où

- **Quoi** : `pg_dump --format=custom` de la base `POSTGRES_DB` du service `postgres` de
  `infra/prod/compose.console.yaml`, exécuté à l'intérieur du conteneur (aucun mot de passe transite en clair
  hors du conteneur : l'authentification locale par socket Unix est en `trust` sur l'image officielle Postgres).
- **Quand** : quotidien, avant toute migration ou mise à jour, et avant tout `pg_restore`.
- **Où** : `${HERMES_DB_BACKUP_DIR:-./backups/postgres}` sur l'hôte (monté dans le conteneur `postgres` sur
  `/backups`). Ce dossier n'est pas commité ; sauvegardez-le vous-même hors du serveur (voir plus bas).

## Prérequis

Le script `infra/prod/backup-postgres.sh` lit `POSTGRES_USER` et `POSTGRES_DB` (les mêmes valeurs que le
service `postgres` en cours d'exécution) depuis l'environnement du shell qui l'exécute — il ne lit ni n'affiche
jamais `POSTGRES_PASSWORD`. Chargez votre `.env` de production dans le shell avant d'appeler le script ou une
cible `make` :

```bash
set -a; source .env; set +a
```

## Sauvegarde

```bash
make prod-db-backup
# équivalent : infra/prod/backup-postgres.sh backup
```

Produit `backups/postgres/hermes-console-<POSTGRES_DB>-<horodatage-ISO>.dump` et applique la rétention
(`HERMES_DB_BACKUP_RETENTION_DAYS`, défaut 14 jours : les fichiers plus anciens sont supprimés).

## Planification (cron système, exemple)

```cron
# /etc/cron.d/hermes-console-db-backup — tous les jours à 03h10, heure serveur
10 3 * * * deploy cd /opt/hermes-console && set -a && . ./.env && set +a && make prod-db-backup >> /var/log/hermes-console-db-backup.log 2>&1
```

Adaptez l'utilisateur (`deploy`) et le chemin (`/opt/hermes-console`) à votre installation. Le redirect vers un
fichier de log système reste hors du dépôt et hors des conteneurs, conformément au contrat de logging
(`docs/operations/logging.md`).

Sauvegardez également `backups/postgres/` lui-même vers un stockage hors du serveur (objet distant, autre
machine…) : un backup qui ne quitte jamais le serveur ne protège pas d'une panne disque ou d'une perte de VM.
Ce transfert hors-site n'est pas scripté ici ; branchez votre outil habituel (rsync, restic, snapshot du
provider…) sur ce même dossier.

## Restauration

Restauration destructive sur la base de production — confirmation manuelle requise :

```bash
set -a; source .env; set +a
make prod-db-restore FILE=hermes-console-hermes_console-2026-07-17T031000Z.dump
```

Le script exécute `pg_restore --clean --if-exists`, qui supprime puis recrée les objets existants avant de
réinjecter le dump. Arrêtez `web` (ou passez-le en mode maintenance) pendant une restauration pour éviter
d'écrire dans la base en cours de restauration.

## Test de restauration (recommandé avant toute restauration réelle, et périodiquement)

Restaure le dump dans une base scratch dédiée (`hermes_console_restore_test`), sans toucher à la base de
production :

```bash
set -a; source .env; set +a
infra/prod/backup-postgres.sh test-restore hermes-console-hermes_console-2026-07-17T031000Z.dump
# Inspection manuelle possible via psql sur hermes_console_restore_test, puis :
infra/prod/backup-postgres.sh test-restore-cleanup
```

Un test de restauration régulier (mensuel, par exemple) est la seule façon de savoir qu'un dump est réellement
exploitable — une sauvegarde jamais restaurée n'est qu'une hypothèse.
