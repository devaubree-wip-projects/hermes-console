# Hermes Console architecture

## Target topology

╔══════════════════════════════════════════════════════════════════════════════╗
║ Product authority: apps/web (Next.js)                                      ║
║ auth · RBAC · tenants/workspaces · product database · public HTTP routes   ║
╚══════════════════════════════════════════════════════════════════════════════╝
             │ signed service HTTP / runtime commands
             ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║ Edge and relay: apps/gateway (Go)                                           ║
║ protocol enforcement · runtime proxy · relay · lifecycle · session events  ║
╚══════════════════════════════════════════════════════════════════════════════╝
             │ authenticated Hermes HTTP + WebSocket
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Existing or Docker-managed Hermes installations                             │
└──────────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║ packages/shared                                                             ║
║ language-neutral gateway contract + public DTO/error types                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
             │ contract import / protocol version
             ├──────────────────────────────▶ apps/web
             └──────────────────────────────▶ apps/gateway

Legend: downward arrows are authenticated runtime control/data flow. Side arrows are compile-time contract imports.

Components:

- `apps/web`: public product and API surface; remains the authority for identity, authorization, tenancy and persistence.
- `apps/gateway`: deployable Go Edge/Relay in front of Hermes; it never becomes the product or RBAC authority.
- `packages/shared`: stable cross-runtime contracts, DTOs, errors and constants; no product behavior.
- Hermes installations: existing remote/systemwide installations remain connectable; Docker is a target runtime, not a migration prerequisite.

## Web layers

╔══════════════════════════════════════════════════════════════════════════════╗
║ presentation: src/app routes + UI                                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
             │ validated command/query DTO
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ application: src/modules/*/application use-cases and ports                  │
└──────────────────────────────────────────────────────────────────────────────┘
             │ domain models + port calls
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ domain: src/modules/*/domain policies, errors and value types               │
└──────────────────────────────────────────────────────────────────────────────┘
             ▲ port implementation
             │
┌──────────────────────────────────────────────────────────────────────────────┐
│ infrastructure: src/modules/*/infrastructure DB, gateway and telemetry      │
└──────────────────────────────────────────────────────────────────────────────┘

Legend: downward arrows are allowed source dependencies; the upward arrow means infrastructure implements an application/domain port.

Components: presentation adapters, application use-cases, domain policy/types and infrastructure adapters. The initial bounded slices are
`auth`, `agents` and `installations`; no new business domain should be created only to hold technical helpers.

## Import rules

1. `src/app` route handlers validate transport input, invoke one use-case and map the result to the unchanged public response contract.
2. Presentation may import application and shared contracts. It must not perform direct Drizzle queries or Hermes/Gateway calls for a migrated slice.
3. Application may import its domain and declared ports. It must not import Next.js, React or concrete database/gateway adapters.
4. Domain is framework-free. It may import stable types from `@hermes-console/shared`, but never Next.js, Drizzle or infrastructure.
5. Infrastructure implements ports and may import Drizzle, Hermes clients and telemetry. It must not import presentation.
6. Cross-slice access goes through an exported application API or a shared contract, never through another slice's infrastructure internals.
7. Public URL paths, HTTP methods, response payloads and the Drizzle schema are tracked by `docs/audit/contract-baseline.json`; deliberate changes re-baseline it (see "Changing frozen contracts").

## Runtime and tooling invariants

- Bun workspaces and Bun scripts are the only JavaScript package/build entrypoints; use `bunx` for package executables.
- Root scripts remain compatibility aliases for the historical commands.
- Go remains the native toolchain behind the Bun gateway scripts.
- Architecture audit outputs are regenerated with `bun run audit:architecture` and checked with `bun run contracts:verify`.

### Changing frozen contracts (routes / DB schema)

`docs/audit/contract-baseline.json` freezes the public route surface and the `schema.ts` hash so accidental
changes fail CI. A **deliberate** product change (new route, new table, schema edit) re-baselines it:

1. Make the route/schema change and, for schema changes, generate the migration: `bun run db:generate`.
2. Regenerate the snapshot: `bun run audit:architecture` (writes `docs/audit/contracts-current.json`).
3. Review the route/schema diff between `contract-baseline.json` and `contracts-current.json` — every entry
   must be intended.
4. Adopt the snapshot as the new baseline: copy `contracts-current.json` over `contract-baseline.json`.
5. Confirm `bun run contracts:verify` passes and commit the baseline alongside the code change, so the diff
   documents the contract evolution.
