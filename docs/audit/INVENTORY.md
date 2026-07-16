# Architecture inventory

Generated from commit `599668e0e968385eaba878a9e1e4695a6da8c4ab` with `bun run audit:architecture`. Secrets are never read; environment inventory uses tracked references only.

## Public API endpoints

| Methods | Path | Route | Critical |
|---|---|---|---|
| GET, POST | `/api/:tenantSlug/:workspaceSlug/agent-teams` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agent-teams/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/agents` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/route.ts` | yes |
| DELETE, GET, PUT | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/inference` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/inference/route.ts` | yes |
| DELETE, GET, POST | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/inference/codex` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/inference/codex/route.ts` | yes |
| GET, POST, PUT | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/messaging` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/messaging/route.ts` | yes |
| GET | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/runtime-status` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/runtime-status/route.ts` | yes |
| POST | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/runtime-ticket` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/runtime-ticket/route.ts` | yes |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/sessions` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/sessions/route.ts` | yes |
| DELETE, GET, PATCH | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/sessions/:sessionId` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/sessions/[sessionId]/route.ts` | yes |
| GET | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/sessions/:sessionId/metrics` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/agents/[agentSlug]/sessions/[sessionId]/metrics/route.ts` | yes |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/automations` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/automations/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/automations/:automationId/run` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/automations/[automationId]/run/route.ts` | no |
| GET | `/api/:tenantSlug/:workspaceSlug/events` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/events/route.ts` | no |
| GET, PATCH | `/api/:tenantSlug/:workspaceSlug/inbox` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/inbox/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/installations` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/route.ts` | yes |
| GET, PATCH | `/api/:tenantSlug/:workspaceSlug/installations/:installationId` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/route.ts` | yes |
| POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/backups` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/backups/route.ts` | yes |
| PUT | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/budget` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/budget/route.ts` | yes |
| PUT | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/capacity-policy` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/capacity-policy/route.ts` | yes |
| POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/enrollment` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/enrollment/route.ts` | yes |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/operations` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/operations/route.ts` | yes |
| POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/upgrades` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/upgrades/route.ts` | yes |
| DELETE, POST | `/api/:tenantSlug/:workspaceSlug/installations/enroll` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/enroll/route.ts` | yes |
| POST | `/api/:tenantSlug/:workspaceSlug/installations/preflight` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/preflight/route.ts` | yes |
| GET | `/api/:tenantSlug/:workspaceSlug/interventions` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/interventions/route.ts` | no |
| PATCH | `/api/:tenantSlug/:workspaceSlug/interventions/:interventionId` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/interventions/[interventionId]/route.ts` | no |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/projects` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/projects/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/projects/:projectId/resources` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/projects/[projectId]/resources/route.ts` | no |
| DELETE | `/api/:tenantSlug/:workspaceSlug/resources/:resourceId` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/resources/[resourceId]/route.ts` | no |
| PUT | `/api/:tenantSlug/:workspaceSlug/runtime/config` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/runtime/config/route.ts` | no |
| GET | `/api/:tenantSlug/:workspaceSlug/skills/content` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/skills/content/route.ts` | no |
| PUT | `/api/:tenantSlug/:workspaceSlug/tools/toolsets/:name` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/tools/toolsets/[name]/route.ts` | no |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/work-items` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/route.ts` | no |
| DELETE, GET, PATCH | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/assign` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/assign/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/cancel` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/cancel/route.ts` | no |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/comments` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/comments/route.ts` | no |
| DELETE, POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/dependencies` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/dependencies/route.ts` | no |
| DELETE, POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/labels` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/labels/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/resources` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/resources/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/runs` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/runs/route.ts` | no |
| GET | `/api/:tenantSlug/:workspaceSlug/work-items/:workItemId/timeline` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-items/[workItemId]/timeline/route.ts` | no |
| GET, POST | `/api/:tenantSlug/:workspaceSlug/work-labels` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-labels/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/work-runs/:runId/cancel` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-runs/[runId]/cancel/route.ts` | no |
| POST | `/api/:tenantSlug/:workspaceSlug/work-runs/:runId/plan-steps/:stepId/promote` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-runs/[runId]/plan-steps/[stepId]/promote/route.ts` | no |
| GET | `/api/:tenantSlug/:workspaceSlug/work-stream` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-stream/route.ts` | no |
| DELETE, GET, POST | `/api/:tenantSlug/:workspaceSlug/work-views` | `apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-views/route.ts` | no |
| PATCH | `/api/approvals/:approvalId` | `apps/web/src/app/api/approvals/[approvalId]/route.ts` | no |
| POST | `/api/auth/login` | `apps/web/src/app/api/auth/login/route.ts` | yes |
| POST | `/api/auth/logout` | `apps/web/src/app/api/auth/logout/route.ts` | yes |
| POST | `/api/auth/register` | `apps/web/src/app/api/auth/register/route.ts` | yes |
| POST | `/api/files` | `apps/web/src/app/api/files/route.ts` | no |
| DELETE, GET | `/api/files/:fileId` | `apps/web/src/app/api/files/[fileId]/route.ts` | no |
| POST | `/api/internal/work/automations/cron` | `apps/web/src/app/api/internal/work/automations/cron/route.ts` | no |
| POST | `/api/onboarding/complete` | `apps/web/src/app/api/onboarding/complete/route.ts` | no |
| GET | `/api/onboarding/runtime` | `apps/web/src/app/api/onboarding/runtime/route.ts` | no |
| POST | `/api/runtime/enroll` | `apps/web/src/app/api/runtime/enroll/route.ts` | yes |
| POST | `/api/runtime/work/claim` | `apps/web/src/app/api/runtime/work/claim/route.ts` | no |
| POST | `/api/runtime/work/runs/:runId/complete` | `apps/web/src/app/api/runtime/work/runs/[runId]/complete/route.ts` | no |
| POST | `/api/runtime/work/runs/:runId/events` | `apps/web/src/app/api/runtime/work/runs/[runId]/events/route.ts` | no |
| POST | `/api/runtime/work/runs/:runId/heartbeat` | `apps/web/src/app/api/runtime/work/runs/[runId]/heartbeat/route.ts` | no |
| POST | `/api/runtime/work/runs/:runId/interventions` | `apps/web/src/app/api/runtime/work/runs/[runId]/interventions/route.ts` | no |
| POST | `/api/runtime/work/runs/:runId/release` | `apps/web/src/app/api/runtime/work/runs/[runId]/release/route.ts` | no |
| POST | `/api/runtime/work/runs/:runId/start` | `apps/web/src/app/api/runtime/work/runs/[runId]/start/route.ts` | no |
| POST | `/api/tasks` | `apps/web/src/app/api/tasks/route.ts` | no |
| POST | `/api/tasks/:taskId/run` | `apps/web/src/app/api/tasks/[taskId]/run/route.ts` | no |
| POST | `/api/work-hooks/:automationId` | `apps/web/src/app/api/work-hooks/[automationId]/route.ts` | no |
| POST | `/api/workspaces` | `apps/web/src/app/api/workspaces/route.ts` | no |
| DELETE, PATCH | `/api/workspaces/:workspaceId` | `apps/web/src/app/api/workspaces/[workspaceId]/route.ts` | no |

## Public pages

| Path | Page |
|---|---|
| `/` | `apps/web/src/app/page.tsx` |
| `/:tenantSlug/:workspaceSlug/agents` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/agents/page.tsx` |
| `/:tenantSlug/:workspaceSlug/agents/new` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/agents/new/page.tsx` |
| `/:tenantSlug/:workspaceSlug/approvals` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/approvals/page.tsx` |
| `/:tenantSlug/:workspaceSlug/automations` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/automations/page.tsx` |
| `/:tenantSlug/:workspaceSlug/d/chat/*segments?` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/d/chat/[[...segments]]/page.tsx` |
| `/:tenantSlug/:workspaceSlug/dashboard` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/dashboard/page.tsx` |
| `/:tenantSlug/:workspaceSlug/events` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/events/page.tsx` |
| `/:tenantSlug/:workspaceSlug/files` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/files/page.tsx` |
| `/:tenantSlug/:workspaceSlug/inbox` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/inbox/page.tsx` |
| `/:tenantSlug/:workspaceSlug/installations` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/installations/page.tsx` |
| `/:tenantSlug/:workspaceSlug/installations/:installationId` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/installations/[installationId]/page.tsx` |
| `/:tenantSlug/:workspaceSlug/integrations` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/integrations/page.tsx` |
| `/:tenantSlug/:workspaceSlug/knowledge` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/knowledge/page.tsx` |
| `/:tenantSlug/:workspaceSlug/models` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/models/page.tsx` |
| `/:tenantSlug/:workspaceSlug/projects` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/projects/page.tsx` |
| `/:tenantSlug/:workspaceSlug/projects/:projectId` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/projects/[projectId]/page.tsx` |
| `/:tenantSlug/:workspaceSlug/settings` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/settings/page.tsx` |
| `/:tenantSlug/:workspaceSlug/settings/:panel` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/settings/[panel]/page.tsx` |
| `/:tenantSlug/:workspaceSlug/skills` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/skills/page.tsx` |
| `/:tenantSlug/:workspaceSlug/tasks` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/tasks/page.tsx` |
| `/:tenantSlug/:workspaceSlug/tasks/:taskId` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/tasks/[taskId]/page.tsx` |
| `/:tenantSlug/:workspaceSlug/team` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/team/page.tsx` |
| `/:tenantSlug/:workspaceSlug/tools` | `apps/web/src/app/(app)/[tenantSlug]/[workspaceSlug]/tools/page.tsx` |
| `/login` | `apps/web/src/app/(auth)/login/page.tsx` |
| `/onboarding` | `apps/web/src/app/(app)/onboarding/page.tsx` |
| `/register` | `apps/web/src/app/(auth)/register/page.tsx` |
| `/workspaces/new` | `apps/web/src/app/(app)/workspaces/new/page.tsx` |

## Environment variables

| Variable | Tracked references |
|---|---|
| `DATABASE_URL` | `apps/web/drizzle.config.ts`<br>`apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/work-stream/route.ts`<br>`apps/web/src/db/index.ts`<br>`apps/web/src/modules/work/infrastructure/work-runtime.integration.test.ts`<br>`scripts/migrate-product-model.ts`<br>`scripts/migrate-runtime-installations.ts`<br>`scripts/migrate-work-control-plane.ts`<br>`scripts/reset-product-data.ts` |
| `E2E_BASE_URL` | `apps/web/playwright.config.ts` |
| `E2E_REAL_WORK` | `apps/web/e2e/seed.ts`<br>`apps/web/e2e/work-real.spec.ts`<br>`apps/web/e2e/work.spec.ts` |
| `HERMES_ALLOWED_ORIGINS` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_ALLOWED_VERSIONS` | `apps/gateway/gateway/config.go` |
| `HERMES_BACKUP_DIR` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_BACKUP_ENCRYPTION_KEY` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_BACKUP_RESTORE_ENABLED` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_CLI_PATH` | `scripts/install-hermes-console-control.ts` |
| `HERMES_CONSOLE_URL` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_CPU_LIMIT` | `infra/dev/compose.yaml` |
| `HERMES_DASHBOARD_SESSION_TOKEN` | `scripts/install-hermes-console-control.ts` |
| `HERMES_DATA_DIR` | `infra/dev/compose.yaml` |
| `HERMES_DEFAULT_GATEWAY_URL` | `apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/app/api/onboarding/complete/route.ts`<br>`apps/web/src/app/api/workspaces/route.ts`<br>`apps/web/src/db/seed.ts`<br>`apps/web/src/lib/hermes/installations.ts`<br>`scripts/dev-stack.ts`<br>`scripts/migrate-runtime-installations.ts` |
| `HERMES_DEFAULT_INSTALLATION_ID` | `apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/installations.ts`<br>`infra/dev/compose.yaml`<br>`scripts/dev-stack.ts`<br>`scripts/migrate-runtime-installations.ts` |
| `HERMES_DEFAULT_INSTALLATION_NAME` | `apps/web/src/lib/hermes/installations.ts`<br>`scripts/migrate-runtime-installations.ts` |
| `HERMES_DEV_LOGIN_EMAIL` | `apps/web/src/app/(auth)/login/page.tsx`<br>`apps/web/src/modules/auth/infrastructure/auth-service.ts` |
| `HERMES_DEV_LOGIN_PASSWORD` | `apps/web/src/app/(auth)/login/page.tsx`<br>`apps/web/src/modules/auth/infrastructure/auth-service.ts` |
| `HERMES_EDGE_IDENTITY_DIR` | `infra/prod/compose.edge.yaml` |
| `HERMES_GATEWAY_ALLOWED_HOSTS` | `apps/web/src/lib/hermes/gateway-url.test.ts`<br>`apps/web/src/lib/hermes/gateway-url.ts` |
| `HERMES_GATEWAY_DERIVE_SECRETS` | `apps/web/e2e/work.spec.ts`<br>`apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/gateway-auth.ts`<br>`apps/web/src/lib/hermes/runtime-ticket.ts`<br>`apps/web/src/modules/work/infrastructure/runtime-auth.ts`<br>`scripts/dev-stack.ts`<br>`scripts/maintain-runtime-backups.ts` |
| `HERMES_GATEWAY_ENV` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_GATEWAY_PORT` | `infra/dev/compose.yaml` |
| `HERMES_GATEWAY_SERVICE_SECRET` | `apps/gateway/gateway/config.go`<br>`apps/web/e2e/work.spec.ts`<br>`apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`apps/web/src/modules/work/infrastructure/runtime-auth.ts`<br>`infra/dev/compose.yaml`<br>`scripts/dev-stack.ts`<br>`scripts/maintain-runtime-backups.ts` |
| `HERMES_GATEWAY_TICKET_SECRET` | `apps/gateway/gateway/config.go`<br>`apps/web/e2e/work.spec.ts`<br>`apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`apps/web/src/modules/work/infrastructure/runtime-auth.ts`<br>`infra/dev/compose.yaml`<br>`scripts/dev-stack.ts`<br>`scripts/maintain-runtime-backups.ts` |
| `HERMES_GID` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_HOME` | `apps/web/src/lib/hermes/extension-files.ts`<br>`apps/web/src/lib/hermes/server.ts` |
| `HERMES_IMAGE_TAG` | `infra/dev/compose.yaml` |
| `HERMES_INSTALLATION_ID` | `apps/gateway/gateway/config.go` |
| `HERMES_LOG_FORMAT` | `apps/web/src/lib/observability/logger.ts`<br>`infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_LOG_HTTP` | `apps/web/src/proxy.ts` |
| `HERMES_LOG_LEVEL` | `apps/web/src/lib/observability/logger.ts`<br>`infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_MEMORY_LIMIT` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_CERT_DIR` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_CLIENT_CERT` | `apps/gateway/gateway/config.go` |
| `HERMES_RELAY_CLIENT_KEY` | `apps/gateway/gateway/config.go` |
| `HERMES_RELAY_CREDENTIAL` | `apps/gateway/gateway/config.go` |
| `HERMES_RELAY_IDENTITY_SECRET` | `apps/gateway/gateway/config.go`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`infra/dev/compose.yaml` |
| `HERMES_RELAY_MAX_CONNECTIONS` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_MAX_CONNECTIONS_PER_TENANT` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_MAX_FRAME_BYTES` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_PORT` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_PUBLIC_URL` | `apps/web/src/app/api/runtime/enroll/route.ts` |
| `HERMES_RELAY_REVOCATION_FILE` | `apps/gateway/gateway/config.go` |
| `HERMES_RELAY_SERVER_CA` | `apps/gateway/gateway/config.go`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_RELAY_SERVER_CERT` | `apps/gateway/gateway/config.go` |
| `HERMES_RELAY_SERVER_KEY` | `apps/gateway/gateway/config.go` |
| `HERMES_RELAY_STATE_DIR` | `infra/dev/compose.yaml` |
| `HERMES_RELAY_URL` | `apps/gateway/gateway/config.go`<br>`apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/[installationId]/enrollment/route.ts`<br>`apps/web/src/app/api/[tenantSlug]/[workspaceSlug]/installations/enroll/route.ts`<br>`apps/web/src/app/api/runtime/enroll/route.ts` |
| `HERMES_RUNTIME_TOKEN` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml`<br>`scripts/install-hermes-console-control.ts` |
| `HERMES_RUNTIME_URL` | `infra/prod/compose.edge.yaml`<br>`scripts/install-hermes-console-control.ts` |
| `HERMES_RUNTIME_WS` | `infra/prod/compose.edge.yaml` |
| `HERMES_SESSION_CHANGE_DEBOUNCE_MS` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_SESSION_RECONCILE_MS` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_SYSTEM_HOME` | `infra/prod/compose.edge.yaml` |
| `HERMES_UID` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_UPGRADE_EXECUTABLE` | `apps/gateway/gateway/config.go` |
| `HERMES_WORK_CAPACITY` | `infra/dev/compose.yaml` |
| `HERMES_WORK_DIR` | `infra/dev/compose.yaml` |
| `HERMES_WORK_ENABLED` | `infra/dev/compose.yaml` |
| `HERMES_WORK_INSTALLATION_ID` | `apps/gateway/gateway/config.go` |
| `HERMES_WORKSPACE_DIR` | `infra/dev/compose.yaml` |
| `HERMES_WORKSPACE_READ_ONLY` | `infra/dev/compose.yaml` |
| `MOCK_HERMES_PORT` | `scripts/mock-hermes.ts` |
| `NEXT_DIST_DIR` | `apps/web/next.config.ts` |
| `NEXT_RUNTIME` | `apps/web/src/instrumentation.ts` |
| `NODE_ENV` | `apps/web/src/app/(auth)/login/page.tsx`<br>`apps/web/src/components/shared/chat/assistant-ui/composer-trigger-popover.tsx`<br>`apps/web/src/db/index.ts`<br>`apps/web/src/lib/auth.ts`<br>`apps/web/src/lib/hermes/gateway-url.ts`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`apps/web/src/lib/observability/logger.ts`<br>`apps/web/src/modules/auth/infrastructure/auth-service.ts`<br>`apps/web/src/modules/work/infrastructure/ephemeral-interventions.ts`<br>`apps/web/src/proxy.ts` |
| `TAVILY_API_KEY` | `apps/web/src/lib/shared/chat/web-search.ts` |
| `UPLOAD_DIR` | `apps/web/src/app/api/files/route.ts`<br>`apps/web/src/app/api/workspaces/[workspaceId]/route.ts` |
| `WORK_AUTOMATION_CRON_SECRET` | `apps/web/src/app/api/internal/work/automations/cron/route.ts` |

## Migration artifacts

- `apps/web/drizzle.config.ts`
- `scripts/migrate-product-model.ts`
- `scripts/migrate-runtime-installations.ts`
- `scripts/migrate-work-control-plane.ts`

## Key configuration

- `.env.example`
- `Makefile`
- `apps/gateway/go.mod`
- `apps/gateway/go.sum`
- `apps/gateway/package.json`
- `apps/web/drizzle.config.ts`
- `apps/web/eslint.config.mjs`
- `apps/web/next.config.ts`
- `apps/web/package.json`
- `apps/web/playwright.config.ts`
- `apps/web/tsconfig.json`
- `bun.lock`
- `infra/dev/compose.override.yaml`
- `infra/dev/compose.yaml`
- `infra/prod/compose.edge.yaml`
- `package.json`
- `packages/shared/gatewaycontracts/go.mod`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
