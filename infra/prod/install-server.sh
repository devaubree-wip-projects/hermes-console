#!/usr/bin/env bash
#
# install-server.sh — installation de Hermes Console sur un serveur, en une commande.
#
# À exécuter SUR le serveur, depuis la racine du dépôt :
#   ./infra/prod/install-server.sh --domain=<domaine>
#
# Depuis la machine de dev, `make prod-install PROD_HOST=root@<hote> PROD_DOMAIN=…`
# envoie le dépôt puis lance ce script à distance.
#
# Étapes, toutes idempotentes :
#   1. Pré-vol      Docker, ports 80/443, disque, RAM, DNS du domaine
#   2. Secrets      générés une fois (openssl), jamais réécrits ni affichés
#   3. Images       build web + edge, pull du runtime Hermes (digest noté)
#   4. Migrations   service one-shot `migrate`, AVANT que `web` démarre
#   5. Démarrage    postgres → web → caddy (TLS) → hermes → edge
#   6. Health-gate  refuse de rendre la main sur une stack qui ne répond pas
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE=(docker compose --project-directory . -f infra/prod/compose.console.yaml -f infra/prod/compose.runtime.yaml)
# Notre Caddy ne démarre que si on l'a demandé : sur un hôte qui en héberge déjà
# un sur 80/443, le lancer couperait les sites existants.
PROXY_PROFILE=(--profile standalone-proxy)

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

DOMAIN="${DOMAIN:-}"
ALLOW_IP="${ALLOW_IP:-}"
SHARED_PROXY=0
SKIP_DNS_CHECK=0
CADDY_CONF_D="${CADDY_CONF_D:-/opt/caddy/conf.d}"
DEMO_ACCOUNTS=0
for arg in "$@"; do
  case "$arg" in
    --domain=*)   DOMAIN="${arg#*=}" ;;
    --domain)     die "Utilise --domain=<domaine> (avec un signe égal)" ;;
    --allow-ip=*) ALLOW_IP="${arg#*=}" ;;
    --allow-ip)   die "Utilise --allow-ip=<ip[,ip…]> (ex. --allow-ip=203.0.113.7)" ;;
    --caddy-conf-d=*) CADDY_CONF_D="${arg#*=}" ;;
    --demo-accounts) DEMO_ACCOUNTS=1 ;;
    --skip-dns)   SKIP_DNS_CHECK=1 ;;
    --shared-proxy)
      SHARED_PROXY=1
      COMPOSE+=(-f infra/prod/compose.shared-proxy.yaml)
      PROXY_PROFILE=() ;;
    -h|--help)
      printf 'Usage: ./infra/prod/install-server.sh --domain=<domaine> [--allow-ip=<ip,…>] [--shared-proxy] [--skip-dns]\n\n'
      printf '  --domain=<domaine>  Domaine servi en HTTPS (ex. hermes.<ip-du-serveur>.sslip.io)\n'
      printf '  --allow-ip=<ip,…>   IP/CIDR autorisées à joindre la Console. Par défaut : l’IP\n'
      printf '                      depuis laquelle tu es connecté en SSH. Tout le reste reçoit 403.\n'
      printf '  --shared-proxy      L’hôte a déjà un reverse proxy sur 80/443 : ne pas démarrer le\n'
      printf '                      nôtre, raccorder web à son réseau et déposer notre fichier de\n'
      printf '                      site dans son conf.d (validate puis reload à chaud).\n'
      printf '  --caddy-conf-d=<d>  conf.d de ce proxy partagé (défaut : /opt/caddy/conf.d)\n'
      printf '  --demo-accounts     Environnement de TEST : crée l’organisation de démonstration\n'
      printf '                      et affiche les 3 comptes en autofill sur la page de connexion.\n'
      printf '                      Leur mot de passe est public et l’un est propriétaire — jamais\n'
      printf '                      sur une instance servant de vrais utilisateurs. Sans ce drapeau,\n'
      printf '                      l’install remet HERMES_DEMO_ACCOUNTS à false (coupe-circuit).\n'
      printf '  --skip-dns          Ne pas vérifier que le domaine pointe sur ce serveur\n'
      exit 0 ;;
    *) die "Option inconnue : $arg (voir --help)" ;;
  esac
done
[ -n "$DOMAIN" ] || die "Domaine requis : ./infra/prod/install-server.sh --domain=<domaine>"

# Sans allowlist, Caddy répond 403 à tout le monde (vérifié) : c'est la bonne
# direction d'échec, mais un déploiement muet serait inutilisable. On la résout
# explicitement, sinon on refuse d'installer.
if [ -z "$ALLOW_IP" ]; then
  ALLOW_IP="$(grep -E '^HERMES_ALLOWED_IPS=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)"
fi
if [ -z "$ALLOW_IP" ] && [ -n "${SSH_CLIENT:-}" ]; then
  ALLOW_IP="$(printf '%s' "$SSH_CLIENT" | awk '{print $1}')"
  info "Allowlist déduite de ta connexion SSH : $ALLOW_IP"
fi
[ -n "$ALLOW_IP" ] || die "Aucune IP autorisée. Passe --allow-ip=<ton_ip> (sinon Caddy renverrait 403 à tout le monde)."
# Caddy attend une liste séparée par des espaces ; on accepte aussi les virgules.
ALLOW_IP="$(printf '%s' "$ALLOW_IP" | tr ',' ' ' | tr -s ' ')"

printf '%sHermes Console — installation serveur%s\n' "$BOLD" "$RESET"
info "domaine : $DOMAIN"

# --- 1. Pré-vol --------------------------------------------------------------
step "Pré-vol"
command -v docker >/dev/null 2>&1 || die "Docker absent. Installe-le (https://docs.docker.com/engine/install/) puis relance."
docker compose version >/dev/null 2>&1 || die "Plugin Docker Compose absent (docker-compose-plugin)."
docker info >/dev/null 2>&1 || die "Le démon Docker ne répond pas (droits ? service arrêté ?)."
ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') + compose"

# Ports 80/443 : seuls Caddy ou une stack déjà installée ont le droit d'y être.
if [ "$SHARED_PROXY" = 1 ]; then
  ok "proxy partagé : ports 80/443 laissés au reverse proxy en place"
else
for port in 80 443; do
  holder="$(ss -tlnp 2>/dev/null | awk -v p=":$port\$" '$4 ~ p {print $6; exit}' || true)"
  if [ -n "$holder" ] && ! printf '%s' "$holder" | grep -q 'docker\|caddy'; then
    die "Le port $port est déjà pris par un autre service ($holder). Libère-le puis relance."
  fi
done
ok "ports 80 et 443 disponibles"
fi

disk_free_gb="$(df -BG --output=avail . | tail -1 | tr -dc '0-9')"
[ "${disk_free_gb:-0}" -ge 10 ] || die "Espace disque insuffisant : ${disk_free_gb}G libres, 10G minimum (images + Postgres + runs)."
ok "${disk_free_gb}G libres sur le disque"

ram_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "${ram_mb:-0}" -lt 3800 ]; then
  warn "RAM détectée : ${ram_mb}Mo. Le runtime Hermes est plafonné à 4G ; prévois du swap ou baisse HERMES_MEMORY_LIMIT."
else
  ok "${ram_mb}Mo de RAM"
fi

if [ "$SKIP_DNS_CHECK" = 0 ]; then
  resolved="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
  public_ip="$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "$resolved" ]; then
    warn "$DOMAIN ne résout pas encore. Caddy ne pourra pas obtenir de certificat tant que le DNS n'est pas propagé."
  elif [ -n "$public_ip" ] && [ "$resolved" != "$public_ip" ]; then
    warn "$DOMAIN pointe sur $resolved alors que ce serveur est en $public_ip. Le certificat TLS échouera."
  else
    ok "$DOMAIN pointe bien sur ce serveur"
  fi
fi

# --- 2. Secrets --------------------------------------------------------------
step "Configuration et secrets"
if [ ! -f .env ]; then
  [ -f .env.example ] || die ".env.example introuvable — dépôt incomplet."
  cp .env.example .env
  chmod 600 .env
  ok ".env créé depuis .env.example"
else
  chmod 600 .env
  ok ".env déjà présent (secrets existants conservés)"
fi

# Remplace une valeur si la clé est absente, vide, ou encore sur un placeholder.
set_env() {
  local key="$1" value="$2"
  local current
  current="$(grep -E "^${key}=" .env | tail -1 | cut -d= -f2- || true)"
  case "$current" in
    ''|*change-me*|*replace-with*|*USER:PASSWORD*|*example.com*)
      if grep -qE "^${key}=" .env; then
        # La valeur passe par un fichier temporaire : jamais dans argv, donc jamais
        # visible dans `ps` par un autre utilisateur du serveur.
        local tmp; tmp="$(mktemp)"
        VALUE="$value" awk -v k="$key" 'BEGIN{v=ENVIRON["VALUE"]} $0 ~ "^" k "=" {print k "=" v; next} {print}' .env > "$tmp"
        mv "$tmp" .env
      else
        printf '%s=%s\n' "$key" "$value" >> .env
      fi
      return 0 ;;
    *) return 1 ;;
  esac
}

generated=0
for key in POSTGRES_PASSWORD HERMES_GATEWAY_TICKET_SECRET HERMES_GATEWAY_SERVICE_SECRET \
           HERMES_RUNTIME_TOKEN WORK_AUTOMATION_CRON_SECRET HERMES_BACKUP_ENCRYPTION_KEY \
           HERMES_RELAY_IDENTITY_SECRET HERMES_INSTALLATION_SECRET_KEY; do
  if set_env "$key" "$(openssl rand -hex 32)"; then generated=$((generated + 1)); fi
done
chmod 600 .env
[ "$generated" -gt 0 ] && ok "$generated secret(s) générés (openssl, 32 octets)" || ok "secrets déjà en place"

# Valeurs non secrètes, alignées sur le domaine servi.
set_env POSTGRES_USER hermes_console || true
set_env POSTGRES_DB hermes_console || true
python3 - "$DOMAIN" "$ALLOW_IP" "$DEMO_ACCOUNTS" <<'PY' || die "Échec d'écriture du .env — installation interrompue."
import re, sys
domain, allowed_ips, demo = sys.argv[1], sys.argv[2], sys.argv[3]
wanted = {
    "HERMES_ALLOWED_IPS": allowed_ips,
    # Réécrit à chaque install : relancer sans --demo-accounts referme le panneau.
    "HERMES_DEMO_ACCOUNTS": "true" if demo == "1" else "false",
    "HERMES_CONSOLE_DOMAIN": domain,
    "HERMES_CONSOLE_URL": f"https://{domain}",
    "HERMES_ALLOWED_ORIGINS": f"https://{domain}",
    "HERMES_GATEWAY_ENV": "production",
    "HERMES_LOG_FORMAT": "json",
    "HERMES_RUNTIME_KIND": "docker",
    "HERMES_DEFAULT_GATEWAY_MODE": "direct",
    # L'Edge partage le namespace réseau du service hermes : c'est là que la Console
    # doit le joindre. 127.0.0.1 désignerait le conteneur web lui-même.
    "HERMES_DEFAULT_GATEWAY_URL": "http://hermes:8787",
    # Ce que reçoit le NAVIGATEUR pour ouvrir le WebSocket de l'agent : le nom de
    # service Docker ci-dessus n'existe pas hors du réseau. Ne remplace que l'URL
    # WebSocket ; les appels serveur→Edge restent directs.
    "HERMES_PUBLIC_GATEWAY_URL": f"https://{domain}/gateway",
}
lines = open(".env").read().splitlines()
seen = set()
out = []
for line in lines:
    m = re.match(r"^([A-Z0-9_]+)=", line)
    if m and m.group(1) in wanted and m.group(1) not in seen:
        seen.add(m.group(1))
        out.append(f"{m.group(1)}={wanted[m.group(1)]}")
    elif m and m.group(1) in wanted:
        continue  # doublon de clé : on ne garde que la première, réécrite
    else:
        out.append(line)
for key, value in wanted.items():
    if key not in seen:
        out.append(f"{key}={value}")
open(".env", "w").write("\n".join(out) + "\n")
PY
ok "domaine, URLs et mode production écrits dans .env"
ok "accès restreint à : $ALLOW_IP (tout le reste reçoit 403 avant d'atteindre la Console)"

# --- 3. Images ---------------------------------------------------------------
step "Images"
info "Pull du runtime Hermes (image volumineuse au premier boot)…"
"${COMPOSE[@]}" pull --quiet hermes
digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "nousresearch/hermes-agent:${HERMES_IMAGE_TAG:-latest}" 2>/dev/null || true)"
if [ -n "$digest" ]; then
  printf '%s\n' "$digest" > .hermes-image-digest
  ok "runtime figé : $digest"
  info "En cas de régression : docker compose … up -d avec HERMES_IMAGE_TAG pointant sur ce digest."
fi
info "Build des images Console et Edge…"
"${COMPOSE[@]}" build hermes-console-web edge
ok "images construites"

# --- 4. Migrations (one-shot, avant web) -------------------------------------
step "Base de données"
"${COMPOSE[@]}" up -d postgres
info "Attente de Postgres…"
for _ in $(seq 1 60); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q postgres)" 2>/dev/null || echo starting)"
  [ "$state" = healthy ] && break
  sleep 2
done
[ "${state:-}" = healthy ] || die "Postgres n'est pas devenu sain. Voir : docker compose … logs postgres"
ok "Postgres prêt"
"${COMPOSE[@]}" --profile migrate run --rm migrate || die "Migrations échouées — la stack n'est PAS démarrée. Voir la sortie ci-dessus."
ok "schéma à jour (migrations versionnées, journal tenu)"

# --- 5. Démarrage ------------------------------------------------------------
step "Démarrage de la stack"
"${COMPOSE[@]}" "${PROXY_PROFILE[@]}" up -d
ok "conteneurs lancés"

# --- 6. Site du reverse proxy partagé ----------------------------------------
# Avant le health-gate : sans ce fichier, le proxy ne connaît pas le domaine et
# la vérification HTTPS ci-dessous ne pourrait pas aboutir.
if [ "$SHARED_PROXY" = 1 ]; then
  step "Site du reverse proxy partagé"
  [ -d "$CADDY_CONF_D" ] || die "conf.d introuvable : $CADDY_CONF_D (préciser --caddy-conf-d=<dir>)."
  site="$CADDY_CONF_D/50-hermes-console.caddy"
  wanted="$(cat <<SITE
# Hermes Console — déploiement privé (docker compose, projet hermes-console-product)
# Écrit par infra/prod/install-server.sh --shared-proxy. Accès restreint par IP :
# voir HERMES_ALLOWED_IPS dans ${ROOT_DIR}/.env

${DOMAIN} {
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }

    # Journal propre à ce site : sans lui, un 403 est indiscernable d'une panne
    # (l'hôte n'active aucun log d'accès par défaut). Le volume est borné par la
    # rotation, et le fichier atterrit dans le dossier de logs déjà monté par le
    # proxy. Les autres sites ne sont pas concernés.
    log {
        output file /var/log/caddy/hermes-console.log {
            roll_size 10MiB
            roll_keep 5
        }
        format json
    }

    # route{} conserve l'ordre du fichier. Sans lui, Caddy applique son ordre de
    # directives par défaut et l'allowlist ne précéderait pas forcément le
    # routage : le contrôle d'accès doit passer en premier, toujours.
    route {
        @blocked not remote_ip ${ALLOW_IP}
        respond @blocked "Forbidden" 403

        # Le navigateur ouvre le WebSocket de l'agent ici. Matcher sur le chemin
        # exact : les autres routes de l'Edge (contrôle gateway, backup, upgrade,
        # revoke, travail Telegram) ne doivent pas devenir publiques.
        @gateway_ws path /gateway/v1/ws
        handle @gateway_ws {
            uri strip_prefix /gateway
            reverse_proxy hermes-console-gateway:8787
        }

        handle {
            reverse_proxy hermes-console-web:3000 {
                header_up Host {host}
                header_up X-Real-IP {remote}
            }
        }
    }
}
SITE
)"
  if [ -f "$site" ] && [ "$(cat "$site")" = "$wanted" ]; then
    ok "site déjà à jour dans $CADDY_CONF_D (aucun reload nécessaire)"
  else
    # Le conteneur du proxy partagé, pas le nôtre : celui du profil
    # standalone-proxy porte le nom du projet et n'est pas démarré ici.
    caddy_ctr="$(docker ps --format '{{.Names}}' | grep -i caddy | grep -v hermes-console | head -1 || true)"
    [ -n "$caddy_ctr" ] || die "Aucun conteneur Caddy trouvé sur l'hôte : --shared-proxy suppose un proxy en place."
    previous=""
    if [ -f "$site" ]; then previous="$(mktemp)"; cp "$site" "$previous"; fi
    printf '%s\n' "$wanted" > "$site"
    # Un reload est atomique : une config invalide est refusée et l'ancienne
    # reste active. On valide quand même d'abord, pour restaurer nous-mêmes
    # plutôt que de laisser un fichier cassé sur le disque du proxy.
    if docker exec "$caddy_ctr" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      docker exec "$caddy_ctr" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
        || die "Reload de $caddy_ctr refusé — la configuration précédente reste active."
      ok "site déposé dans $CADDY_CONF_D et rechargé à chaud ($caddy_ctr)"
    else
      if [ -n "$previous" ]; then cp "$previous" "$site"; else rm -f "$site"; fi
      die "Configuration Caddy invalide avec notre site — fichier restauré, aucun reload. Les autres sites sont intacts."
    fi
  fi
  warn "Ce proxy est annoncé « Ansible managed » : porter ce fichier dans le rôle, sinon le prochain run l'effacera."
fi

# --- 7. Health-gate ----------------------------------------------------------
step "Vérification"
# La santé applicative se lit sur le conteneur : une requête sortante depuis le
# serveur reviendrait par Caddy avec l'IP du serveur, que l'allowlist rejette.
app_ok=0
for _ in $(seq 1 60); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q hermes-console-web)" 2>/dev/null || echo starting)"
  [ "$state" = healthy ] && { app_ok=1; break; }
  sleep 5
done
[ "$app_ok" = 1 ] && ok "Console saine (healthcheck du conteneur web)" \
  || warn "La Console n'est pas devenue saine. Voir : ${COMPOSE[*]} logs hermes-console-web"

# Caddy : un 403 est un succès ici, il prouve que le TLS est en place ET que
# l'allowlist filtre (le serveur n'est pas dans la liste). Un 200 signifie que
# l'IP sortante du serveur y figure aussi.
tls_code=""
for _ in $(seq 1 36); do
  tls_code="$(curl -sS -o /dev/null -w '%{http_code}' -m 8 "https://${DOMAIN}/" 2>/dev/null || true)"
  case "$tls_code" in 200|403) break ;; esac
  sleep 5
done
case "$tls_code" in
  403) ok "HTTPS actif et allowlist en vigueur (403 depuis le serveur, attendu)" ;;
  200) ok "HTTPS actif ; l'IP sortante de ce serveur est également autorisée" ;;
  *)   warn "Pas encore de réponse HTTPS valide (code « ${tls_code:-aucun} »)."
       warn "Causes usuelles : DNS non propagé, ou certificat Let's Encrypt en cours d'émission."
       info "Diagnostic : ${BOLD}${COMPOSE[*]} logs caddy${RESET}" ;;
esac
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}'

# --- 8. Comptes de démonstration (test uniquement) ---------------------------
# Le seed n'écrit plus que deux lignes dans `users` : il n'interroge pas l'Edge et
# ne dépend donc que de Postgres. L'organisation, le runtime et le premier agent
# sont créés par /onboarding, à la première connexion de l'owner.
if [ "$DEMO_ACCOUNTS" = 1 ]; then
  step "Comptes de démonstration"
  "${COMPOSE[@]}" --profile seed-demo run --rm seed-demo \
    || die "Seed échoué. La stack tourne, mais la page de connexion propose des comptes qui n'existent pas : relance avec --demo-accounts."
  ok "comptes owner et member créés — l'organisation se crée via /onboarding"
  warn "2 comptes à mot de passe public, dont un futur propriétaire. Environnement de test uniquement."
fi

step "Terminé"
printf '  Console      : %shttps://%s%s\n' "$BOLD" "$DOMAIN" "$RESET"
printf '  Accès        : restreint à %s%s%s — élargir : relancer avec --allow-ip=…\n' "$BOLD" "$ALLOW_IP" "$RESET"
printf '  Premier pas  : crée le compte propriétaire sur %shttps://%s/%s puis suis /onboarding\n' "$DIM" "$DOMAIN" "$RESET"
printf '  Clé LLM      : Paramètres → Intégrations (stockée dans le profil de l’agent, jamais dans .env)\n'
printf '  Logs         : docker compose --project-directory . -f infra/prod/compose.console.yaml -f infra/prod/compose.runtime.yaml logs -f\n'
