#!/usr/bin/env bash
# Remet une installation conteneurisée à zéro : profils Hermes supprimés, données
# produit purgées. La prochaine inscription repasse par /onboarding.
#
# Contrairement à `bun run db:reset` (dev, qui exige le CLI hermes et DATABASE_URL
# dans l'environnement courant), ce script pilote la stack Docker de production :
# le CLI vit dans le conteneur Hermes et la base dans le conteneur Postgres, donc
# aucun processus n'a les deux sous la main.
#
# Une sauvegarde horodatée est prise AVANT toute destruction, à chaque exécution.
#
#   ./scripts/reset-prod.sh --yes            # base vierge, inscription via /onboarding
#   ./scripts/reset-prod.sh --yes --seed     # + comptes de démonstration, prêt à l'emploi
#
# Avec --seed, le mot de passe des comptes vient de SEED_DEMO_PASSWORD si elle est
# posée dans le .env ; sinon c'est `demo-password`, qui est public.
set -euo pipefail

HERMES=${HERMES_CONTAINER:-hermes-console-product-hermes-1}
PG=${POSTGRES_CONTAINER:-hermes-console-product-postgres-1}
PGUSER_=${POSTGRES_USER:-hermes_console}
PGDB=${POSTGRES_DB:-hermes_console}
VOLUME=${HERMES_DATA_VOLUME:-hermes-console-product_hermes-data}
ROOT=${HERMES_CONSOLE_DIR:-/opt/hermes-console}

CONFIRMED=0
SEED=0
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRMED=1 ;;
    --seed) SEED=1 ;;
    *) printf 'Option inconnue : %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if [ "$CONFIRMED" -ne 1 ]; then
  cat >&2 <<'USAGE'
Commande destructive : supprime tous les comptes, organisations, agents et
profils Hermes de cette installation. Relancez avec :

  ./scripts/reset-prod.sh --yes           # base vierge (inscription via /onboarding)
  ./scripts/reset-prod.sh --yes --seed    # + comptes de démonstration
USAGE
  exit 1
fi

COMPOSE=(docker compose --project-directory "$ROOT"
  -f "$ROOT/infra/prod/compose.console.yaml"
  -f "$ROOT/infra/prod/compose.runtime.yaml"
  -f "$ROOT/infra/prod/compose.shared-proxy.yaml")

STAMP=$(date +%Y-%m-%dT%H-%M-%S)
BACKUP="$ROOT/backups/reset-$STAMP"

echo "==> 1/4  Sauvegarde dans $BACKUP"
mkdir -p "$BACKUP"
docker exec "$PG" pg_dump -U "$PGUSER_" -d "$PGDB" -Fc -f /tmp/reset.dump
docker cp "$PG":/tmp/reset.dump "$BACKUP/hermes_console.dump"
docker exec "$PG" rm -f /tmp/reset.dump
docker run --rm -v "$VOLUME":/data:ro -v "$BACKUP":/out alpine:3 \
  tar czf /out/hermes-data.tar.gz -C /data . 2>/dev/null
ls -lh "$BACKUP"

echo "==> 2/4  Arrêt des gateways et suppression des profils Hermes"
docker exec "$HERMES" sh -c '
  H=/opt/hermes/.venv/bin/hermes
  for d in /opt/data/profiles/*/; do
    [ -d "$d" ] || continue
    p=$(basename "$d")
    [ "$p" = "default" ] && continue
    echo "    - $p"
    "$H" -p "$p" gateway stop >/dev/null 2>&1 || true
    "$H" profile delete -y "$p" >/dev/null 2>&1 || rm -rf "$d"
  done
'

# TRUNCATE ... CASCADE part de `users` et atteint tenants, workspaces, agents et
# runtime_installations. L'UUID d'installation référencé par l'Edge disparaît donc :
# l'étape 3 du rappel final le remet à jour, sans quoi chaque claim retourne 401.
echo "==> 3/4  Purge des données produit (TRUNCATE users CASCADE)"
docker exec "$PG" psql -U "$PGUSER_" -d "$PGDB" -q \
  -c "TRUNCATE TABLE users RESTART IDENTITY CASCADE;"

if [ "$SEED" -eq 1 ]; then
  echo "==> 4/6  Création des comptes et de l'organisation de démonstration"
  "${COMPOSE[@]}" --profile seed-demo run --rm seed-demo

  echo "==> 5/6  Raccordement de l'Edge et démarrage des gateways"
  # Un profil recréé par le seed n'a pas de gateway_state.json. Le reconciler de
  # boot du conteneur Hermes (hermes_cli/container_boot.py) n'auto-démarre que les
  # profils dont l'état persisté vaut `running` : sans ce premier start, la
  # messagerie reste muette et le prochain `docker restart` la laissera muette.
  # Ce start écrit desired_state=running une bonne fois — ensuite ça se relance seul.
  docker exec "$HERMES" sh -c '
    H=/opt/hermes/.venv/bin/hermes
    for d in /opt/data/profiles/*/; do
      [ -d "$d" ] || continue
      p=$(basename "$d")
      # `default` est le gateway du conteneur lui-même (CMD `gateway run`), déjà lancé.
      [ "$p" = "default" ] && continue
      echo "    - gateway $p"
      "$H" -p "$p" gateway start >/dev/null 2>&1 \
        || echo "      démarrage refusé — voir /opt/data/logs/gateways/$p/current" >&2
    done
  '

  # Le seed recrée runtime_installations avec un UUID neuf. L'Edge signe ses
  # requêtes Work pour une installation nommée : sans mise à jour ici, chaque
  # claim repartirait en 401 et il faudrait le découvrir dans les logs.
  NEW_ID=$(docker exec "$PG" psql -U "$PGUSER_" -d "$PGDB" -t -A \
    -c "SELECT id FROM runtime_installations ORDER BY created_at LIMIT 1;")
  if [ -n "$NEW_ID" ]; then
    if grep -q '^HERMES_WORK_INSTALLATION_ID=' "$ROOT/.env"; then
      sed -i "s|^HERMES_WORK_INSTALLATION_ID=.*|HERMES_WORK_INSTALLATION_ID=$NEW_ID|" "$ROOT/.env"
    else
      printf '\nHERMES_WORK_INSTALLATION_ID=%s\n' "$NEW_ID" >> "$ROOT/.env"
    fi
    echo "    installation : $NEW_ID"
    "${COMPOSE[@]}" up -d edge >/dev/null
    echo "    Edge redémarré"
  else
    echo "    aucune installation créée — Work laissé désactivé" >&2
  fi
  STEP="6/6"
else
  STEP="4/4"
fi

echo "==> $STEP  État final"
docker exec "$PG" psql -U "$PGUSER_" -d "$PGDB" -c \
  "SELECT 'tenants' t, count(*) FROM tenants
   UNION ALL SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'agents', count(*) FROM agents
   UNION ALL SELECT 'runtime_installations', count(*) FROM runtime_installations;"
docker exec "$HERMES" sh -c 'echo "profils restants :"; ls /opt/data/profiles/ 2>/dev/null || echo "  (aucun)"'

if [ "$SEED" -eq 1 ]; then
  docker exec "$PG" psql -U "$PGUSER_" -d "$PGDB" -c \
    "SELECT u.email, tm.role FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
     ORDER BY u.email;"
  if grep -qE '^SEED_DEMO_PASSWORD=.+' "$ROOT/.env"; then
    echo "Mot de passe : celui de SEED_DEMO_PASSWORD dans .env."
  else
    echo "Mot de passe : 'demo-password' — PUBLIC (documenté dans le repo)."
    echo "Posez SEED_DEMO_PASSWORD dans .env et relancez pour des comptes non devinables."
  fi
  echo
  echo "Reste à faire : créer un bot dans @BotFather, puis le brancher depuis la page"
  echo "Intégrations de l'agent — via l'appairage, pas la configuration manuelle."
else
  cat <<'NEXT'

Terminé. Étapes suivantes :
  1. Inscrivez-vous sur la Console : /onboarding recrée l'organisation et le 1er agent.
  2. Relevez le nouvel UUID d'installation :
       docker exec hermes-console-product-postgres-1 psql -U hermes_console \
         -d hermes_console -t -c "SELECT id FROM runtime_installations;"
  3. Reportez-le dans .env (HERMES_WORK_INSTALLATION_ID=<uuid>) puis redémarrez l'Edge :
       docker compose --project-directory . \
         -f infra/prod/compose.console.yaml -f infra/prod/compose.runtime.yaml \
         -f infra/prod/compose.shared-proxy.yaml up -d edge
     Sans cette étape l'Edge démarre mais laisse le Work désactivé, et le dit dans son log.

  Ou relancez avec --seed pour que tout ça soit fait automatiquement.
NEXT
fi
