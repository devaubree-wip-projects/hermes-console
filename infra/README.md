# Infrastructure

- `dev/` contient la stack Docker Compose locale Hermes + Edge + Relay, son override sans redémarrage et son
  couple `gateway.Dockerfile` / `gateway.Dockerfile.dockerignore`.
- `prod/` contient le Compose Edge destiné à connecter une installation Hermes systemwide distante et son
  propre couple Dockerfile/ignore, qui exclut les tests du contexte de production.

Les fichiers sont déplacés hors de la racine, mais leurs chemins relatifs continuent de partir de la racine du
dépôt grâce à `docker compose --project-directory .`. Les commandes habituelles restent `make dev`,
`make runtime-up` et les autres cibles du `Makefile`.
