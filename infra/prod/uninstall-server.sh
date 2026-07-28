#!/usr/bin/env bash
#
# uninstall-server.sh — retire entièrement Hermes Console d'un serveur, en une commande.
#
# Le script s'exécute SUR le serveur et ne lit aucun fichier du dépôt : il doit
# survivre à la suppression de celui-ci, qui est sa dernière étape. Il est donc
# conçu pour être envoyé par un pipe depuis la machine de dev :
#   make prod-uninstall CONFIRM=yes
#   ssh root@serveur 'bash -s -- --yes' < infra/prod/uninstall-server.sh
#
# Étapes, toutes idempotentes :
#   1. Site Caddy   retrait de notre fichier du conf.d partagé, validation, reload
#   2. Conteneurs   compose down -v, projet hermes-console-product uniquement
#   3. Balayage     reliquats filtrés par label Compose (jamais de `docker prune`)
#   4. Images       Console et Edge ; runtime Hermes seulement si demandé
#   5. Dépôt        suppression de /opt/hermes-console, .env et ses secrets compris
#
# ⚠️ Destructif : les volumes portent la base (comptes, board, audit) et les
# livrables des runs. Rien n'est sauvegardé ici — faire `make prod-db-backup` avant.
set -euo pipefail

# Le nom de projet est figé dans les fichiers compose (`name:`) : c'est lui qui
# borne tout ce que ce script a le droit de détruire sur un hôte partagé.
PROJECT="hermes-console-product"
TARGET="/opt/hermes-console"
CADDY_CONF_D="/opt/caddy/conf.d"
SITE_FILE="50-hermes-console.caddy"
PURGE_RUNTIME=0
CONFIRMED=0

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi
step() { printf '\n%s▸ %s%s\n' "$BOLD$BLUE" "$1" "$RESET"; }
info() { printf '  %s\n' "$1"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRMED=1 ;;
    --path=*) TARGET="${arg#*=}" ;;
    --caddy-conf-d=*) CADDY_CONF_D="${arg#*=}" ;;
    --purge-runtime-image) PURGE_RUNTIME=1 ;;
    -h|--help)
      printf 'Usage: ./infra/prod/uninstall-server.sh --yes [--path=<dir>] [--caddy-conf-d=<dir>] [--purge-runtime-image]\n\n'
      printf '  --yes                   Obligatoire. Confirme la destruction (volumes compris).\n'
      printf '  --path=<dir>            Racine du dépôt à supprimer (défaut : /opt/hermes-console)\n'
      printf '  --caddy-conf-d=<dir>    conf.d du reverse proxy partagé (défaut : /opt/caddy/conf.d)\n'
      printf '  --purge-runtime-image   Supprimer aussi nousresearch/hermes-agent (2,6 Go à re-télécharger)\n'
      exit 0 ;;
    *) die "Option inconnue : $arg (voir --help)" ;;
  esac
done
[ "$CONFIRMED" = 1 ] || die "Refus : cette opération détruit la base et les livrables. Relance avec --yes."

command -v docker >/dev/null 2>&1 || die "Docker absent — rien à désinstaller ?"

printf '%sHermes Console — désinstallation serveur%s\n' "$BOLD" "$RESET"
info "projet compose : $PROJECT"
info "dépôt          : $TARGET"

# --- 1. Site du reverse proxy partagé ----------------------------------------
# Retiré en premier : la Console cesse d'être publiée avant de disparaître, plutôt
# que de laisser le proxy pointer quelques secondes vers un backend mort.
step "Site du reverse proxy"
site="$CADDY_CONF_D/$SITE_FILE"
if [ -f "$site" ]; then
  # Notre propre Caddy (profil standalone-proxy) ne doit pas être confondu avec
  # celui de l'hôte : il porte le nom du projet et va être détruit à l'étape 2.
  caddy_ctr="$(docker ps --format '{{.Names}}' | grep -i caddy | grep -v "$PROJECT" | head -1 || true)"
  backup="$(mktemp /tmp/50-hermes-console.caddy.XXXXXX)"
  cp "$site" "$backup"
  rm -f "$site"
  if [ -n "$caddy_ctr" ]; then
    if docker exec "$caddy_ctr" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      if docker exec "$caddy_ctr" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
        ok "site retiré de $caddy_ctr et configuration rechargée"
      else
        warn "Fichier retiré mais le reload a échoué : la config en vigueur sert encore la Console."
      fi
    else
      # La config restante est cassée : ce n'est pas notre fichier qui posait
      # problème, et recharger couperait les autres sites de l'hôte.
      cp "$backup" "$site"
      die "Configuration Caddy invalide sans notre fichier — restauré, aucun reload effectué. Les autres sites sont intacts."
    fi
  else
    warn "Aucun conteneur Caddy détecté : fichier retiré, reload à faire à la main."
  fi
  info "Copie du fichier retiré : $backup"
else
  ok "aucun site Hermes Console dans $CADDY_CONF_D"
fi

# --- 2. Conteneurs et volumes ------------------------------------------------
step "Conteneurs et volumes"
if [ -f "$TARGET/infra/prod/compose.console.yaml" ]; then
  # Les deux profils sont cités pour que les services qu'ils masquent (notre Caddy
  # standalone, le one-shot migrate) soient eux aussi démontés.
  ( cd "$TARGET" && docker compose --project-directory . \
      -f infra/prod/compose.console.yaml \
      -f infra/prod/compose.runtime.yaml \
      --profile standalone-proxy --profile migrate \
      down --volumes --remove-orphans ) \
    && ok "stack démontée (compose down -v)" \
    || warn "compose down a échoué (.env incomplet ?) — le balayage par label prend le relais."
else
  info "Fichiers compose absents — balayage par label uniquement."
fi

# Filet : ce qui porte le label du projet et aurait survécu. Le filtre par label
# est ce qui garantit qu'aucune ressource des autres stacks n'est touchée.
ids="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)"
if [ -n "$ids" ]; then
  # shellcheck disable=SC2086
  docker rm -f $ids >/dev/null && ok "$(printf '%s\n' "$ids" | wc -l) conteneur(s) résiduel(s) supprimé(s)"
fi
nets="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)"
if [ -n "$nets" ]; then
  # shellcheck disable=SC2086
  docker network rm $nets >/dev/null 2>&1 && ok "réseau(x) du projet supprimé(s)" || true
fi
vols="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)"
if [ -n "$vols" ]; then
  # shellcheck disable=SC2086
  docker volume rm $vols >/dev/null && ok "$(printf '%s\n' "$vols" | wc -l) volume(s) résiduel(s) supprimé(s)"
fi

# --- 3. Images ---------------------------------------------------------------
step "Images"
for img in hermes-console-web:latest hermes-console-edge:latest; do
  if docker image rm -f "$img" >/dev/null 2>&1; then ok "$img supprimée"; else info "$img absente"; fi
done
if [ "$PURGE_RUNTIME" = 1 ]; then
  runtime="nousresearch/hermes-agent:${HERMES_IMAGE_TAG:-latest}"
  if docker image rm -f "$runtime" >/dev/null 2>&1; then
    ok "$runtime supprimée (2,6 Go à re-télécharger à la prochaine install)"
  else
    info "$runtime absente"
  fi
else
  info "runtime Hermes conservé en cache (--purge-runtime-image pour l'enlever)"
fi

# --- 4. Dépôt ----------------------------------------------------------------
step "Dépôt"
if [ -d "$TARGET" ]; then
  cd /
  rm -rf "$TARGET"
  ok "$TARGET supprimé (.env et secrets compris)"
else
  ok "$TARGET déjà absent"
fi

# --- 5. Vérification ---------------------------------------------------------
step "Vérification"
left="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l)"
left_vols="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l)"
if [ "$left" -eq 0 ] && [ "$left_vols" -eq 0 ]; then
  ok "plus aucun conteneur ni volume du projet $PROJECT"
else
  warn "reliquats : $left conteneur(s), $left_vols volume(s) — inspecter à la main."
fi
info "Autres stacks de l'hôte, intactes :"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep -v "$PROJECT" || true

step "Terminé"
printf '  Réinstaller : %smake prod-install PROD_DOMAIN=… PROD_ALLOW_IP=… PROD_SHARED_PROXY=1%s\n' "$BOLD" "$RESET"
