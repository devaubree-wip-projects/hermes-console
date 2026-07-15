# Logging dev et production

## Contrat

Les services applicatifs écrivent uniquement sur `stdout`/`stderr`. Aucun fichier de log applicatif n'est créé
dans le dépôt ou dans les conteneurs.

Champs stables pour les logs structurés :

| Champ | Description |
| --- | --- |
| `timestamp` / `time` | Horodatage UTC ISO-8601 |
| `level` | `debug`, `info`, `warn` ou `error` |
| `service` | `hermes-web` ou `hermes-gateway` |
| `environment` | `development` ou `production` |
| `message` | Événement stable, par exemple `http.request.completed` |
| `requestId` | Corrélation Web, Edge et réponse HTTP |
| `method`, `path`, `status`, `durationMs` | Contexte HTTP sans query string |

Les clés sensibles (`authorization`, cookies, credentials, mots de passe, clés privées, secrets, signatures,
tokens et webhooks) sont remplacées par `[REDACTED]`. Les query strings et corps de requête ne sont pas inclus
dans les access logs.

## Développement

Valeurs par défaut :

```dotenv
HERMES_LOG_LEVEL=info
HERMES_LOG_FORMAT=pretty
HERMES_LOG_HTTP=false
```

Next.js garde son access log lisible et transmet uniquement les warnings/erreurs navigateur au terminal.
`HERMES_LOG_HTTP=true` active en plus les événements corrélés du proxy pour diagnostiquer un flux précis.
Edge utilise un format texte `key=value`; les healthchecks réussis sont silencieux au niveau `info`.

Commandes :

```bash
make logs
make logs-snapshot
make logs-errors
make logs-edge
make logs-hermes
```

Dozzle de l'infra mutualisée peut également lire les sorties Docker. Le driver Docker `local` borne chaque
service à trois segments de 10 Mo.

## Production

Le Web choisit automatiquement JSON avec `NODE_ENV=production`. Edge reçoit explicitement :

```dotenv
HERMES_LOG_LEVEL=info
HERMES_LOG_FORMAT=json
```

Le Compose `infra/prod/compose.edge.yaml` conserve cinq segments compressés de 25 Mo via `json-file`. Cette
sortie reste compatible avec `docker compose logs`, Dozzle et un collecteur externe. Pour une investigation :

```bash
docker compose --project-directory . -f infra/prod/compose.edge.yaml logs --since 30m --timestamps edge
```

`debug` doit rester temporaire en production. `silent` n'est accepté que par le Web ; Edge utilise `error`
pour réduire au minimum sans masquer les erreurs fatales.
