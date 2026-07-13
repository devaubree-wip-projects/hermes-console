# Hermes Client Console

POC — a client-facing web cockpit for a [Hermes Agent](https://hermes-agent.nousresearch.com) instance.
Hermes stays the engine; this console is the business surface a non-technical client uses to
drive their agent: chat, structured tasks, files, knowledge, permissions, and approvals.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4 + shadcn/ui (radix-nova)
- Drizzle ORM + PostgreSQL (shared dev container `infra-postgres`, database `hermes_console`)
- Bun as package manager / runtime for scripts
- Hermes gateway consumed through its OpenAI-compatible `/v1` API (streaming SSE)

## Getting started (dev)

```bash
bun install
cp .env.example .env        # fill DATABASE_URL (infra-postgres) — see below
bun run db:push             # apply schema
bun run db:seed             # demo user: demo@hermes.local / demo-password
bun run mock:hermes         # terminal 1 — offline OpenAI-compatible mock on :8645
bun run dev                 # terminal 2 — http://localhost:3000
```

`DATABASE_URL` targets the shared dev-infra Postgres (`localhost:5432`, database
`hermes_console`). In containers, the hostname would be `infra-postgres` on `dev-shared-net`.

## Hermes integration

Hermes is installed **natively** on this machine (`~/.local/bin/hermes`), not as a Docker
container. Each workspace stores the OpenAI-compatible base URL it talks to (Réglages →
Connexion à l'agent); the API key is **optional**. Two ways to run the upstream:

- **Real Hermes proxy**: `hermes proxy start` runs a local OpenAI-compatible server on
  **`http://127.0.0.1:8645/v1`** that forwards `/v1/chat/completions` to an OAuth provider
  (`--provider nous` by default, or `xai`). It attaches your real credentials, so the client
  bearer token can be anything. Pick the model with `hermes model`.
- **Offline mock**: `bun run mock:hermes` → `http://localhost:8645/v1`. Canned streamed replies;
  lets you exercise the whole product with no network / no OAuth.

> The proxy is a **pass-through LLM** — it does not expose Hermes' tools/skills/memory. The full
> agent runtime lives behind `hermes serve` (JSON-RPC/WebSocket on `:9119`, used by the desktop
> app). Driving that from the console — so permissions actually gate real tools — is a later
> milestone; today permissions/approvals shape the system prompt and gate task execution only.

## Architecture

```
Next.js (app router)
  ├── pages: dashboard / chat / tasks / files / knowledge / approvals / settings
  ├── API routes: auth, chat (SSE proxy), chat-sessions, tasks, approvals, files, workspaces
  ├── Drizzle → infra-postgres (hermes_console)
  └── streamHermesChat() → Hermes gateway /v1/chat/completions (SSE)
```

Model: `Tenant → Workspace → { ChatSessions → Messages, Tasks, Files, MemoryItems, Approvals }`.
Every workspace-scoped access goes through `getWorkspaceForUser()` (ownership guard).

Task flow: template → task (`draft`, or `waiting_approval` when the mapped permission is
disabled) → approval (client validates) → run = seeded chat session (`?autostart=1`) → the
chat stream completion marks the task `done` and stores the deliverable.

## POC limits (assumed, on purpose)

- Permissions/approvals are **advisory**: they shape the system prompt and gate task
  execution in the console, but nothing is enforced inside the Hermes runtime itself.
  Real enforcement needs gateway-side tool policies.
- File contents are **not** injected into the model context (names only). No RAG.
- Knowledge/memory is read-only, seeded in DB — not yet synced with Hermes memory.
- Gateway API keys are stored plaintext in DB — encrypt before anything multi-client-real.
- Auth is minimal (scrypt + DB session cookie). No rate limiting, no email verification.
