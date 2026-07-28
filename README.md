# Hermes Console

> ## 🚧 Work in progress — not production-ready
>
> This repository is an **active work in progress**. It is published for transparency and
> reference, **not** as a supported product.
>
> - APIs, database schema and deployment scripts change without notice or migration path.
> - There is **no release, no versioning guarantee and no support**.
> - Do **not** run this against real users or real data.
> - Any deployment example here is illustrative — bring your own hosts, domains and secrets.

Web cockpit for Hermes agents. It turns conversations and automations into **durable, assigned,
observable and recoverable work**: tasks, sessions, files, knowledge, approvals and audit.

---

## What it does

Hermes Console is the **product and control authority** around the Hermes runtime. You build one or
several agents, then hand them work that survives outside a browser tab.

It succeeds when a user can immediately tell **which agent is acting, on which object, in which real
state, under whose human responsibility** — and can pick the work back up later.

Four commitments drive the roadmap:

| | Commitment |
|---|---|
| 🎯 | **Usable without being a developer** — create an agent, give it skills and tools, run it: no CLI, no config file, no Hermes internals |
| 🔌 | **Local or remote runtime, by choice** — the same Console drives a runtime on the user's machine or a remote one through an outbound tunnel |
| 🔄 | **Never behind Hermes** — the Console tracks `latest`, *signals* new versions, and the user *decides* when to apply them |
| 💬 | **Drive it from where you already are** — orchestrate agents from Telegram **and** Discord, at parity with the browser |

Roles map to canonical RBAC: `owner` (installs, builds agents, owns sensitive decisions), `member`
(runs day-to-day conversations, tasks, approvals) and `viewer` (read-only audit).

> ℹ️ In this project's vocabulary, **"TUI" means the Console itself** — the Next.js web app. There is
> no terminal interface to build here.

## Architecture

```text
╔══════════════════ apps/web — Next.js (product authority) ═════════════════╗
║ auth · RBAC · tenants · API routes · Postgres schema · audit              ║
║ Sole owner of identity, authorization and persistence                     ║
╚═══════════════════════════════╤═══════════════════════════════════════════╝
                                │ signed HTTP (HMAC + nonce + 30 s window)
                                ▼
╔══════════════════ apps/gateway — Go (Edge / Relay) ═══════════════════════╗
║ protocol enforcement · runtime proxy · relay · lifecycle · events         ║
║ NEVER the product, NEVER the RBAC authority                               ║
╚═══════════════════════════════╤═══════════════════════════════════════════╝
                                │ authenticated Hermes HTTP + WebSocket
                                ▼
┌───────────── Hermes runtime (Docker or system-wide) ──────────────────────┐
│ 1 Hermes profile = 1 agent · BYOK · skills · sessions · cron · MCP        │
└───────────────────────────────────────────────────────────────────────────┘

╔══════════════════ packages/shared ════════════════════════════════════════╗
║ neutral gateway contract, TypeScript AND Go (gateway.json as pivot)       ║
║ DTOs, errors, constants — no business behaviour                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**Legend** — downward arrows are authenticated runtime control/data flow. `packages/shared` is
imported at build time by both sides.

| Component | Path | Role |
|---|---|---|
| Web app | `apps/web` | Next.js 16 / React 19 — UI, auth, RBAC, tenant APIs, Drizzle schema |
| Edge gateway | `apps/gateway` | Go 1.26 — signed protocol enforcement, runtime proxy, relay, event stream |
| Shared contract | `packages/shared` | Gateway DTOs shared by TypeScript and Go |
| Dev / prod infra | `infra/dev`, `infra/prod` | Compose stacks, Caddy, one-command server install |
| Operational scripts | `scripts/`, `tools/` | Migrations, seeds, architecture audit, contract verification |

`apps/web` follows a hexagonal layering — `src/app` (presentation) → `src/modules/*/application` →
`src/modules/*/domain`, with `src/modules/*/infrastructure` implementing the ports. Existing slices:
`auth`, `agents`, `installations`, `work`.

## Stack

- **Runtime / package manager**: [Bun](https://bun.sh) (the only JS entrypoint — `bunx` for binaries)
- **Web**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Zustand, Vercel AI SDK
- **Database**: PostgreSQL + Drizzle ORM (versioned migrations in `apps/web/drizzle`)
- **Gateway**: Go 1.26 (`gorilla/websocket`, `fsnotify`)
- **Tests**: `bun test`, Go `-race`, Playwright (e2e) with `@axe-core/playwright` for accessibility
- **Deployment**: Docker Compose + Caddy (TLS), optionally behind an existing shared reverse proxy

## Getting started

### Prerequisites

- Bun
- Docker + the Compose plugin
- A reachable PostgreSQL instance (the local convention is a Docker container, see `.env.example`)
- Go 1.26 — only if you build or test the gateway
- Python 3 — only for the Telegram control extension tests

### Install

```bash
git clone https://github.com/devaubree-wip-projects/hermes-console.git
cd hermes-console

./install.sh              # or: make install
# ./install.sh --seed     # also create the demo owner/member accounts
# ./install.sh --with-e2e # also install the Playwright browser
```

`install.sh` is idempotent: it checks prerequisites, installs workspace dependencies, copies
`.env.example` to `.env` **without ever overwriting an existing one**, creates the `hermes_console`
database if missing and applies versioned migrations.

Then fill in `.env` — every value ships as a placeholder, none is a working secret. Secrets flagged
`change-me` / `replace-with-…` must be generated locally (`openssl rand -hex 32`).

### Run

```bash
make dev        # full stack in the background (containers detached + Next.js), terminal freed
make dev-fg     # foreground — Ctrl+C stops everything cleanly
make dev-next   # Next.js only
make stop       # stop every dev process and container
make dev-fresh  # stop, then restart without the Next.js cache
```

The Console is served on **http://localhost:3010**. The Edge gateway listens on `127.0.0.1:8787`,
the Hermes runtime on `127.0.0.1:9119`.

`make help` lists every target, including runtime (`runtime-up`, `runtime-logs`, `runtime-status`)
and production ones.

## Everyday commands

| Command | What it does |
|---|---|
| `bun run check` | Full gate: contracts + typecheck + lint + tests + gateway tests + builds |
| `bun run typecheck` | TypeScript, web + shared |
| `bun run lint` | ESLint, web + shared |
| `bun run test` | Unit tests, web + shared |
| `bun run test:gateway` | Go tests with the race detector |
| `bun run test:e2e` | Playwright end-to-end suite (seeds the database first) |
| `bun run contracts:verify` | Fails if public routes or the DB schema drifted from the baseline |
| `bun run audit:architecture` | Regenerates the import graph, inventory and contract snapshot |
| `bun run db:migrate` | Applies the versioned product migrations |
| `bun run db:seed:demo` | Creates the demo `owner` and `member` accounts |
| `bun run db:reset` | Removes accounts, workspaces and Hermes profiles created by the Console |

### Frozen contracts

`docs/audit/contract-baseline.json` freezes the public API routes and a hash of `schema.ts`. Any
accidental drift fails CI. A **deliberate** change is re-baselined explicitly:

1. Make the route/schema change (for a schema: `bun run db:generate`).
2. `bun run audit:architecture` — writes `docs/audit/contracts-current.json`.
3. Review the `contract-baseline.json` ↔ `contracts-current.json` diff. Every entry must be intended.
4. Copy `contracts-current.json` over `contract-baseline.json`.
5. Confirm with `bun run contracts:verify`, then **commit the baseline together with the code** so the
   diff documents how the contract evolved.

## CI

`.github/workflows/ci.yml` runs six jobs on every push:

`web-shared` (contracts + typecheck + lint + test + build) · `gateway` (Go with `-race`) ·
`web-db-integration` (real PostgreSQL) · `telegram-control` (Python unittest) ·
`docker-images` (builds the Console and Edge images, checks the prod compose files parse) ·
`canary-smoke` (Playwright e2e, on `integration/**` branches).

## Deployment

`infra/prod/install-server.sh` installs the whole stack on a server in one command: pre-flight checks
(Docker, ports, disk, RAM, DNS), one-time secret generation, image build, migrations **before** the web
service starts, ordered startup and a health gate.

```bash
make prod-install PROD_HOST=root@<host> PROD_DOMAIN=<domain> PROD_ALLOW_IP=<ip[,ip…]>
```

No host, domain or IP is hard-coded in this repository — supply them at call time or from a local
untracked file. Deployments are **private by default**: Caddy answers `403` to any source outside the
allowlist, before the request reaches the application.

If the host already runs a reverse proxy on 80/443, add `PROD_SHARED_PROXY=1` and drop
`infra/prod/caddy-snippet.example.caddy` into that proxy's `conf.d`.

> ⚠️ `--demo-accounts` creates a demo organisation whose passwords are public and one of which is an
> `owner`. Never enable it on an instance serving real users.

## Security notes

- Full security headers are set on every route (CSP, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS).
- Production **refuses to start** with development secrets, and requires HTTPS for a remote gateway.
- `audit_events` is append-only **at the database level**: a trigger rejects any `UPDATE`, regardless
  of application code.
- Runtime backups are AES-GCM encrypted and verified before being marked ready; a safety backup is
  forced before any restore.
- No credential is committed to this repository. `.env` is never tracked — only `.env.example`,
  which contains placeholders only.

Found something? Open an issue rather than a public pull request describing the vulnerability.

## Known gaps

Being explicit about a WIP is part of the point:

- `workspace`/`tenant` and `tasks`/`work_items` still overlap in the data model.
- A task can reach `done` without a deliverable.
- Audit is append-only but has no hash chain and no export yet.
- The publisher's legal identity (`apps/web/src/lib/company.ts`) is entirely unset, so the legal pages
  render visible "to be completed" markers. No invoice should go out until it is filled in.
- Observability is limited to `/api/healthz` — there is no `/metrics` endpoint.
- Several modules are flagged as unreferenced by the architecture audit and have not been purged.

## Repository layout

```text
apps/web        Next.js app — UI, auth/RBAC, tenant APIs, Drizzle schema and migrations
apps/gateway    Go Edge/Relay — signed protocol, runtime proxy, events
packages/shared Gateway contract shared by TypeScript and Go
infra/dev       Local Compose stack (runtime, edge, database)
infra/prod      Production Compose stack, Caddy, install/uninstall scripts
scripts/        Migrations, seeds, runtime maintenance
tools/          Architecture audit and contract verification
docs/audit/     Generated snapshots — import graph, inventory, contract baseline
MEMORY.md       Durable project truth: decisions, measured state, what not to break
PRODUCT.md      Product intent, personas, design principles
```

## Contributing

There is no contribution process yet — the project is moving too fast for one to be meaningful.
Issues describing concrete problems are welcome; large pull requests are likely to conflict.

Repository conventions live in `CLAUDE.md` and `AGENTS.md` (think before coding, simplicity first,
surgical changes, goal-driven execution).

## License

No license has been chosen yet. Until one is added, **all rights are reserved** — the source is
readable, but not licensed for reuse.
