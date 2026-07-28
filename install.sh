#!/usr/bin/env bash
#
# install.sh — mise en place locale de Hermes Console.
#
# Étapes idempotentes et re-jouables :
#   1. Prérequis (Bun requis ; Docker + Compose vérifiés)
#   2. Dépendances Bun (monorepo workspaces)
#   3. Fichier .env (copié depuis .env.example, jamais écrasé)
#   4. Base de données (crée hermes_console si absente, applique les migrations versionnées)
#   5. Comptes de démonstration owner et member        (--seed)
#   6. Navigateur Playwright pour les tests e2e        (--with-e2e)
#
# Usage : ./install.sh [--seed] [--with-e2e]   (ou : make install)
set -euo pipefail

# Toujours opérer depuis la racine du dépôt, quel que soit le CWD de l'appelant.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# --- Sortie -----------------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi
step()  { printf '\n%s▸ %s%s\n' "$BOLD$BLUE" "$1" "$RESET"; }
info()  { printf '  %s\n' "$1"; }
ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()  { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()   { printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# --- Options ----------------------------------------------------------------
DO_SEED=0
WITH_E2E=0
FORCE_PROD=0
for arg in "$@"; do
  case "$arg" in
    --seed) DO_SEED=1 ;;
    --with-e2e) WITH_E2E=1 ;;
    --prod) FORCE_PROD=1 ;;
    -h|--help)
      printf 'Usage: ./install.sh [--seed] [--with-e2e] [--prod]\n\n'
      printf '  --seed       Créer les comptes de démonstration owner et member (dev)\n'
      printf '  --with-e2e   Installer le navigateur Playwright (tests e2e navigateur)\n'
      printf '  --prod       Mode production : aucune base provisionnée (DB au choix — systemwide / RDS / Docker…)\n'
      exit 0 ;;
    *) die "Option inconnue : $arg (voir ./install.sh --help)" ;;
  esac
done

# Mode : prod si --prod, ou HERMES_GATEWAY_ENV=production (env courant ou .env).
IS_PROD=$FORCE_PROD
ENV_MODE="${HERMES_GATEWAY_ENV:-}"
if [ -z "$ENV_MODE" ] && [ -f .env ]; then
  ENV_MODE="$(grep -E '^HERMES_GATEWAY_ENV=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '[:space:]' || true)"
fi
if [ "$ENV_MODE" = "production" ]; then IS_PROD=1; fi

printf '%sHermes Console — installation%s\n' "$BOLD" "$RESET"

# --- 1. Prérequis -----------------------------------------------------------
step "Prérequis"
command -v bun >/dev/null 2>&1 || die "Bun est requis. Installe-le : https://bun.sh puis relance."
ok "bun $(bun --version)"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "docker + compose"
else
  warn "Docker (avec le plugin Compose) est absent — requis plus tard pour le runtime Hermes (make dev)."
fi

# --- 2. Dépendances ---------------------------------------------------------
step "Dépendances Bun"
bun install
ok "dépendances installées"

# --- 3. Fichier .env --------------------------------------------------------
step "Configuration (.env)"
ENV_FRESH=0
if [ -f .env ]; then
  ok ".env déjà présent (laissé intact)"
elif [ -f .env.example ]; then
  cp .env.example .env
  ENV_FRESH=1
  ok ".env créé depuis .env.example"
  warn "Renseigne DATABASE_URL dans .env (Postgres infra-postgres, base hermes_console)."
else
  die ".env.example introuvable."
fi

# --- 4. Base de données -----------------------------------------------------
DB_READY=0
if [ "$IS_PROD" = 1 ]; then
  step "Base de données (production)"
  info "En production, la base est ton choix : Hermes systemwide, Postgres Docker,"
  info "RDS ou autre managé. install.sh ne crée ni ne migre aucune base ici."
  info "→ Renseigne DATABASE_URL vers ta base, puis applique les migrations depuis"
  info "  ton pipeline de déploiement : ${BOLD}bun run db:migrate${RESET}"
else
step "Base de données (locale — Docker)"
# Convention locale : Postgres tourne sous Docker (conteneur partagé infra-postgres),
# jamais un Postgres installé sur l'hôte.
if command -v docker >/dev/null 2>&1 && \
   docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -qiE 'infra-postgres|postgres'; then
  ok "Postgres Docker détecté (infra-postgres)"
else
  warn "Aucun Postgres Docker détecté. En local la base tourne sous Docker :"
  warn "démarre la stack d'infra partagée (conteneur infra-postgres) puis relance."
fi
# Le statut de connexion est calculé par Bun (charge .env, réutilise le driver postgres).
DB_STATUS="$(bun --env-file=.env -e '
import postgres from "postgres";
const url = process.env.DATABASE_URL ?? "";
if (!url || url.includes("USER:PASSWORD")) { console.log("placeholder"); process.exit(0); }
let target;
try { target = new URL(url); } catch { console.log("invalid"); process.exit(0); }
const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
const opts = { max: 1, connect_timeout: 5, onnotice: () => {} };
try {
  const probe = postgres(url, opts);
  await probe`select 1`;
  await probe.end();
  console.log("ok");
} catch (error) {
  if (error && error.code === "3D000") {
    const admin = new URL(url); admin.pathname = "/postgres";
    try {
      const a = postgres(admin.toString(), opts);
      await a.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
      await a.end();
      console.log("created");
    } catch (e2) { console.log("createfail"); }
  } else {
    console.log("unreachable");
  }
}
' 2>/dev/null || echo error)"

case "$DB_STATUS" in
  ok)          ok "connexion établie" ; DB_READY=1 ;;
  created)     ok "base hermes_console créée" ; DB_READY=1 ;;
  placeholder) warn "DATABASE_URL non configuré (placeholder) — étape base ignorée." ;;
  invalid)     warn "DATABASE_URL invalide — étape base ignorée." ;;
  createfail)  warn "Base absente et création refusée (droits ?). Crée-la manuellement puis relance." ;;
  *)           warn "Postgres injoignable (infra-postgres démarré ? DATABASE_URL correct ?) — étape base ignorée." ;;
esac

if [ "$DB_READY" = 1 ]; then
  info "Application des migrations versionnées…"
  bun run db:migrate || die "Migrations échouées — vérifie DATABASE_URL et que infra-postgres tourne."
  ok "schéma à jour"
fi
fi  # fin base locale (dev)

# --- 5. Données de démonstration (optionnel) --------------------------------
if [ "$DO_SEED" = 1 ]; then
  step "Données de démonstration"
  if [ "$IS_PROD" = 1 ]; then
    warn "Données de démo réservées au développement — ignorées en mode production."
  elif [ "$DB_READY" = 1 ]; then
    bun run db:seed:demo && \
      ok "comptes owner/member @atelier-lumiere.local créés (mot de passe demo-password) — l'organisation se crée via /onboarding" || \
      warn "seed échoué (voir la sortie ci-dessus)."
  else
    warn "Base non prête — seed ignoré."
  fi
fi

# --- 6. Navigateur e2e (optionnel) ------------------------------------------
if [ "$WITH_E2E" = 1 ]; then
  step "Navigateur Playwright (e2e)"
  bun --cwd=apps/web x playwright install --with-deps chromium && \
    ok "navigateur installé" || warn "installation du navigateur échouée."
fi

# --- Récapitulatif ----------------------------------------------------------
step "Terminé"
if [ "$IS_PROD" = 1 ]; then
  printf '  %sMode production — dépendances installées.%s\n' "$BOLD" "$RESET"
  printf '    1. Configure %sDATABASE_URL%s vers ta base (systemwide / RDS / Docker…) et les secrets.\n' "$BOLD" "$RESET"
  printf '    2. Applique les migrations : %sbun run db:migrate%s\n' "$BOLD" "$RESET"
  printf '    3. Déploie via %sinfra/prod/%s (voir %sMEMORY.md §5%s).\n' "$BOLD" "$RESET" "$DIM" "$RESET"
elif [ "$ENV_FRESH" = 1 ] || [ "$DB_READY" != 1 ]; then
  printf '  %sProchaines étapes :%s\n' "$BOLD" "$RESET"
  if [ "$ENV_FRESH" = 1 ]; then
    printf '    1. Renseigne %sDATABASE_URL%s dans %s.env%s (Postgres Docker infra-postgres).\n' "$BOLD" "$RESET" "$DIM" "$RESET"
  fi
  printf '    2. Relance %smake install%s pour provisionner la base.\n' "$BOLD" "$RESET"
  printf '    3. Lance la stack : %smake dev%s → http://localhost:3010\n' "$BOLD" "$RESET"
else
  printf '  Lance la stack : %smake dev%s → http://localhost:3010\n' "$BOLD" "$RESET"
  printf '  %s(make db-seed-demo pour les données de démo, make help pour tout le reste)%s\n' "$DIM" "$RESET"
fi
