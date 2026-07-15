# Canary and rollback runbook

## Flow

╔══════════════════════╗
║ feature branch       ║
╚══════════════════════╝
          │ pull request / frozen-contract check
          ▼
┌──────────────────────┐
│ integration/<name>   │
└──────────────────────┘
          │ CI canary smoke / image or artifact promotion
          ▼
┌──────────────────────┐
│ canary environment   │
└──────────────────────┘
          │ route, auth, tunnel and installation evidence
          ▼
┌──────────────────────┐
│ production promotion │
└──────────────────────┘
          │ failed gate: redeploy previous immutable ref
          └──────────────────────────────────────────────▶ rollback

Legend: arrows name the promotion evidence or rollback trigger. Components: feature branch, integration branch, CI smoke job,
canary runtime and production runtime.

## Preconditions

1. Create the integration branch as `integration/hermes-console-monorepo` from the reviewed commit.
2. Do not mutate public API routes or the database schema: `bun run contracts:verify` must pass.
3. Record the previous immutable deployment reference as `PREVIOUS_REF` and the candidate as `CANDIDATE_REF`.
4. Back up the product database with the existing platform process. This migration itself contains no schema change.

## Gates

Run the same root compatibility commands used before the migration:

```sh
bun install --frozen-lockfile
bun run contracts:verify
bun run typecheck
bun run lint
bun run test
bun run test:gateway
bun run build:all
```

The integration branch also activates the `canary-smoke` CI job. Its route coverage is documented in
`docs/testing/route-regression-matrix.md`; required business evidence is:

- login and authenticated tenant/workspace redirect;
- agent inference read/update and messaging read/action with unchanged payload shapes;
- installation connect, detail and assignment flows;
- Relay/Edge tunnel chat path and Gateway readiness;
- no new 4xx/5xx rate or contract parsing errors during the observation window.

## Rollback triggers

Rollback immediately if any frozen route changes method/path, auth isolation fails, an existing installation cannot reconnect,
the Edge/Relay tunnel fails, or a migration attempts to change the database schema.

## Rollback

1. Stop promotion of `CANDIDATE_REF`.
2. Redeploy `PREVIOUS_REF` through the same deployment mechanism; do not reverse database data because this refactor has no schema migration.
3. Run the historical root probes against the restored release:

```sh
bun run contracts:verify
bun run test:gateway
make runtime-status
```

4. Confirm the critical rows in `docs/testing/route-regression-matrix.md` and preserve candidate logs for diagnosis.
5. Only resume the integration branch after the failed gate has a focused regression test.
