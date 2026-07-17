#!/usr/bin/env bash
# Backup / restore for the production Postgres used by infra/prod/compose.console.yaml.
#
# Usage (run from the repo root):
#   infra/prod/backup-postgres.sh backup
#   infra/prod/backup-postgres.sh restore <filename-in-backups-dir>
#   infra/prod/backup-postgres.sh test-restore <filename-in-backups-dir>
#   infra/prod/backup-postgres.sh test-restore-cleanup
#
# All commands run pg_dump/pg_restore/psql *inside* the "postgres" container via
# `docker compose exec`, connecting over its local Unix socket (trust auth for
# local connections, the official postgres image default) — POSTGRES_PASSWORD is
# therefore never read, printed, or required by this script.
#
# Env (matches infra/prod/compose.console.yaml, load it however you already do —
# this script never reads or prints a real .env itself):
#   POSTGRES_USER              required, must match the running postgres service
#   POSTGRES_DB                required, must match the running postgres service
#   HERMES_DB_BACKUP_DIR       host backups dir, default ./backups/postgres
#                               (must match the postgres service's bind mount)
#   HERMES_DB_BACKUP_RETENTION_DAYS  default 14
#   COMPOSE_FILE                default infra/prod/compose.console.yaml
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-infra/prod/compose.console.yaml}"
BACKUP_DIR="${HERMES_DB_BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${HERMES_DB_BACKUP_RETENTION_DAYS:-14}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER must be set (same value as the postgres service)}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB must be set (same value as the postgres service)}"
SCRATCH_DB="hermes_console_restore_test"

compose() {
  docker compose --project-directory "$REPO_ROOT" -f "$COMPOSE_FILE" "$@"
}

require_backup_dir() {
  mkdir -p "$REPO_ROOT/$BACKUP_DIR"
}

cmd_backup() {
  require_backup_dir
  local stamp file container_path
  stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
  file="hermes-console-${POSTGRES_DB}-${stamp}.dump"
  container_path="/backups/${file}"
  echo "Sauvegarde ${POSTGRES_DB} -> ${BACKUP_DIR}/${file}"
  compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB" -f "$container_path"
  echo "Sauvegarde terminée : ${BACKUP_DIR}/${file}"
  apply_retention
}

apply_retention() {
  find "$REPO_ROOT/$BACKUP_DIR" -maxdepth 1 -name 'hermes-console-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete
}

resolve_backup_file() {
  local name="${1:?fichier de sauvegarde requis (nom uniquement, pas de chemin)}"
  if [ ! -f "$REPO_ROOT/$BACKUP_DIR/$name" ]; then
    echo "Fichier introuvable dans ${BACKUP_DIR} : ${name}" >&2
    exit 1
  fi
  printf '%s' "$name"
}

cmd_restore() {
  local name container_path
  name="$(resolve_backup_file "${1:-}")"
  container_path="/backups/${name}"
  echo "ATTENTION : restauration destructive sur la base de production '${POSTGRES_DB}'."
  read -r -p "Confirmer en tapant exactement 'restore' : " confirm
  [ "$confirm" = "restore" ] || { echo "Annulé."; exit 1; }
  compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "$container_path"
  echo "Restauration terminée sur '${POSTGRES_DB}'."
}

cmd_test_restore() {
  local name container_path
  name="$(resolve_backup_file "${1:-}")"
  container_path="/backups/${name}"
  echo "Test de restauration dans la base scratch '${SCRATCH_DB}' (${POSTGRES_DB} n'est pas touchée)."
  compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" \
    -c "CREATE DATABASE ${SCRATCH_DB};"
  compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$SCRATCH_DB" "$container_path"
  echo "Restauration test réussie dans '${SCRATCH_DB}'."
  echo "Nettoyage : $0 test-restore-cleanup"
}

cmd_test_restore_cleanup() {
  compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};"
  echo "Base scratch '${SCRATCH_DB}' supprimée."
}

case "${1:-}" in
  backup) cmd_backup ;;
  restore) cmd_restore "${2:-}" ;;
  test-restore) cmd_test_restore "${2:-}" ;;
  test-restore-cleanup) cmd_test_restore_cleanup ;;
  *)
    echo "Usage: $0 {backup|restore <fichier>|test-restore <fichier>|test-restore-cleanup}" >&2
    exit 1
    ;;
esac
