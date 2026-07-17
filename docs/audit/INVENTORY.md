# Architecture inventory

Generated from commit `525a116a00890c79e26dcaff00a16efab4101644` with `bun run audit:architecture`. Secrets are never read; environment inventory uses tracked references only.

## Public API endpoints

| Methods | Path | Route | Critical |
|---|---|---|---|
| GET, POST | `/api/:tenantSlug/agent-teams` | `apps/web/src/app/api/[tenantSlug]/agent-teams/route.ts` | no |
| DELETE | `/api/:tenantSlug/agent-teams/:teamId` | `apps/web/src/app/api/[tenantSlug]/agent-teams/[teamId]/route.ts` | no |
| POST | `/api/:tenantSlug/agents` | `apps/web/src/app/api/[tenantSlug]/agents/route.ts` | yes |
| DELETE, PATCH | `/api/:tenantSlug/agents/:agentSlug` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/route.ts` | yes |
| DELETE, GET, PUT | `/api/:tenantSlug/agents/:agentSlug/inference` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/inference/route.ts` | yes |
| DELETE, GET, POST | `/api/:tenantSlug/agents/:agentSlug/inference/codex` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/inference/codex/route.ts` | yes |
| GET, POST, PUT | `/api/:tenantSlug/agents/:agentSlug/messaging` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/messaging/route.ts` | yes |
| GET | `/api/:tenantSlug/agents/:agentSlug/runtime-status` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/runtime-status/route.ts` | yes |
| POST | `/api/:tenantSlug/agents/:agentSlug/runtime-ticket` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/runtime-ticket/route.ts` | yes |
| GET, POST | `/api/:tenantSlug/agents/:agentSlug/sessions` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/sessions/route.ts` | yes |
| DELETE, GET, PATCH | `/api/:tenantSlug/agents/:agentSlug/sessions/:sessionId` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/sessions/[sessionId]/route.ts` | yes |
| GET | `/api/:tenantSlug/agents/:agentSlug/sessions/:sessionId/metrics` | `apps/web/src/app/api/[tenantSlug]/agents/[agentSlug]/sessions/[sessionId]/metrics/route.ts` | yes |
| GET, POST | `/api/:tenantSlug/automations` | `apps/web/src/app/api/[tenantSlug]/automations/route.ts` | no |
| POST | `/api/:tenantSlug/automations/:automationId/run` | `apps/web/src/app/api/[tenantSlug]/automations/[automationId]/run/route.ts` | no |
| GET | `/api/:tenantSlug/events` | `apps/web/src/app/api/[tenantSlug]/events/route.ts` | no |
| GET, PATCH | `/api/:tenantSlug/inbox` | `apps/web/src/app/api/[tenantSlug]/inbox/route.ts` | no |
| POST | `/api/:tenantSlug/installations` | `apps/web/src/app/api/[tenantSlug]/installations/route.ts` | yes |
| GET, PATCH | `/api/:tenantSlug/installations/:installationId` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/route.ts` | yes |
| POST | `/api/:tenantSlug/installations/:installationId/backups` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/backups/route.ts` | yes |
| PUT | `/api/:tenantSlug/installations/:installationId/budget` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/budget/route.ts` | yes |
| PUT | `/api/:tenantSlug/installations/:installationId/capacity-policy` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/capacity-policy/route.ts` | yes |
| POST | `/api/:tenantSlug/installations/:installationId/enrollment` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/enrollment/route.ts` | yes |
| GET, POST | `/api/:tenantSlug/installations/:installationId/operations` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/operations/route.ts` | yes |
| POST | `/api/:tenantSlug/installations/:installationId/upgrades` | `apps/web/src/app/api/[tenantSlug]/installations/[installationId]/upgrades/route.ts` | yes |
| DELETE, POST | `/api/:tenantSlug/installations/enroll` | `apps/web/src/app/api/[tenantSlug]/installations/enroll/route.ts` | yes |
| POST | `/api/:tenantSlug/installations/preflight` | `apps/web/src/app/api/[tenantSlug]/installations/preflight/route.ts` | yes |
| GET | `/api/:tenantSlug/interventions` | `apps/web/src/app/api/[tenantSlug]/interventions/route.ts` | no |
| PATCH | `/api/:tenantSlug/interventions/:interventionId` | `apps/web/src/app/api/[tenantSlug]/interventions/[interventionId]/route.ts` | no |
| POST | `/api/:tenantSlug/invitations` | `apps/web/src/app/api/[tenantSlug]/invitations/route.ts` | no |
| DELETE | `/api/:tenantSlug/invitations/:invitationId` | `apps/web/src/app/api/[tenantSlug]/invitations/[invitationId]/route.ts` | no |
| DELETE, PATCH | `/api/:tenantSlug/members/:memberUserId` | `apps/web/src/app/api/[tenantSlug]/members/[memberUserId]/route.ts` | no |
| GET, POST | `/api/:tenantSlug/projects` | `apps/web/src/app/api/[tenantSlug]/projects/route.ts` | no |
| POST | `/api/:tenantSlug/projects/:projectId/resources` | `apps/web/src/app/api/[tenantSlug]/projects/[projectId]/resources/route.ts` | no |
| DELETE | `/api/:tenantSlug/resources/:resourceId` | `apps/web/src/app/api/[tenantSlug]/resources/[resourceId]/route.ts` | no |
| PUT | `/api/:tenantSlug/runtime/config` | `apps/web/src/app/api/[tenantSlug]/runtime/config/route.ts` | no |
| POST | `/api/:tenantSlug/skills` | `apps/web/src/app/api/[tenantSlug]/skills/route.ts` | no |
| GET, PUT | `/api/:tenantSlug/skills/content` | `apps/web/src/app/api/[tenantSlug]/skills/content/route.ts` | no |
| PUT | `/api/:tenantSlug/skills/toggle` | `apps/web/src/app/api/[tenantSlug]/skills/toggle/route.ts` | no |
| PUT | `/api/:tenantSlug/tools/toolsets/:name` | `apps/web/src/app/api/[tenantSlug]/tools/toolsets/[name]/route.ts` | no |
| GET, POST | `/api/:tenantSlug/work-items` | `apps/web/src/app/api/[tenantSlug]/work-items/route.ts` | no |
| DELETE, GET, PATCH | `/api/:tenantSlug/work-items/:workItemId` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/route.ts` | no |
| POST | `/api/:tenantSlug/work-items/:workItemId/assign` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/assign/route.ts` | no |
| POST | `/api/:tenantSlug/work-items/:workItemId/cancel` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/cancel/route.ts` | no |
| GET, POST | `/api/:tenantSlug/work-items/:workItemId/comments` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/comments/route.ts` | no |
| DELETE, POST | `/api/:tenantSlug/work-items/:workItemId/dependencies` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/dependencies/route.ts` | no |
| DELETE, POST | `/api/:tenantSlug/work-items/:workItemId/labels` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/labels/route.ts` | no |
| POST | `/api/:tenantSlug/work-items/:workItemId/resources` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/resources/route.ts` | no |
| POST | `/api/:tenantSlug/work-items/:workItemId/runs` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/runs/route.ts` | no |
| GET | `/api/:tenantSlug/work-items/:workItemId/timeline` | `apps/web/src/app/api/[tenantSlug]/work-items/[workItemId]/timeline/route.ts` | no |
| GET, POST | `/api/:tenantSlug/work-labels` | `apps/web/src/app/api/[tenantSlug]/work-labels/route.ts` | no |
| POST | `/api/:tenantSlug/work-runs/:runId/cancel` | `apps/web/src/app/api/[tenantSlug]/work-runs/[runId]/cancel/route.ts` | no |
| POST | `/api/:tenantSlug/work-runs/:runId/plan-steps/:stepId/promote` | `apps/web/src/app/api/[tenantSlug]/work-runs/[runId]/plan-steps/[stepId]/promote/route.ts` | no |
| GET | `/api/:tenantSlug/work-stream` | `apps/web/src/app/api/[tenantSlug]/work-stream/route.ts` | no |
| DELETE, GET, POST | `/api/:tenantSlug/work-views` | `apps/web/src/app/api/[tenantSlug]/work-views/route.ts` | no |
| PATCH | `/api/approvals/:approvalId` | `apps/web/src/app/api/approvals/[approvalId]/route.ts` | no |
| POST | `/api/auth/forgot-password` | `apps/web/src/app/api/auth/forgot-password/route.ts` | yes |
| POST | `/api/auth/login` | `apps/web/src/app/api/auth/login/route.ts` | yes |
| POST | `/api/auth/logout` | `apps/web/src/app/api/auth/logout/route.ts` | yes |
| POST | `/api/auth/register` | `apps/web/src/app/api/auth/register/route.ts` | yes |
| POST | `/api/auth/reset-password` | `apps/web/src/app/api/auth/reset-password/route.ts` | yes |
| POST | `/api/files` | `apps/web/src/app/api/files/route.ts` | no |
| DELETE, GET | `/api/files/:fileId` | `apps/web/src/app/api/files/[fileId]/route.ts` | no |
| GET | `/api/healthz` | `apps/web/src/app/api/healthz/route.ts` | no |
| POST | `/api/internal/work/automations/cron` | `apps/web/src/app/api/internal/work/automations/cron/route.ts` | no |
| POST | `/api/invitations/accept` | `apps/web/src/app/api/invitations/accept/route.ts` | no |
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
| `/:tenantSlug` | `apps/web/src/app/(app)/[tenantSlug]/page.tsx` |
| `/:tenantSlug/agents` | `apps/web/src/app/(app)/[tenantSlug]/agents/page.tsx` |
| `/:tenantSlug/agents/new` | `apps/web/src/app/(app)/[tenantSlug]/agents/new/page.tsx` |
| `/:tenantSlug/approvals` | `apps/web/src/app/(app)/[tenantSlug]/approvals/page.tsx` |
| `/:tenantSlug/automations` | `apps/web/src/app/(app)/[tenantSlug]/automations/page.tsx` |
| `/:tenantSlug/d/chat/*segments?` | `apps/web/src/app/(app)/[tenantSlug]/d/chat/[[...segments]]/page.tsx` |
| `/:tenantSlug/dashboard` | `apps/web/src/app/(app)/[tenantSlug]/dashboard/page.tsx` |
| `/:tenantSlug/events` | `apps/web/src/app/(app)/[tenantSlug]/events/page.tsx` |
| `/:tenantSlug/files` | `apps/web/src/app/(app)/[tenantSlug]/files/page.tsx` |
| `/:tenantSlug/inbox` | `apps/web/src/app/(app)/[tenantSlug]/inbox/page.tsx` |
| `/:tenantSlug/installations` | `apps/web/src/app/(app)/[tenantSlug]/installations/page.tsx` |
| `/:tenantSlug/installations/:installationId` | `apps/web/src/app/(app)/[tenantSlug]/installations/[installationId]/page.tsx` |
| `/:tenantSlug/integrations` | `apps/web/src/app/(app)/[tenantSlug]/integrations/page.tsx` |
| `/:tenantSlug/knowledge` | `apps/web/src/app/(app)/[tenantSlug]/knowledge/page.tsx` |
| `/:tenantSlug/models` | `apps/web/src/app/(app)/[tenantSlug]/models/page.tsx` |
| `/:tenantSlug/projects` | `apps/web/src/app/(app)/[tenantSlug]/projects/page.tsx` |
| `/:tenantSlug/projects/:projectId` | `apps/web/src/app/(app)/[tenantSlug]/projects/[projectId]/page.tsx` |
| `/:tenantSlug/settings` | `apps/web/src/app/(app)/[tenantSlug]/settings/page.tsx` |
| `/:tenantSlug/settings/:panel` | `apps/web/src/app/(app)/[tenantSlug]/settings/[panel]/page.tsx` |
| `/:tenantSlug/skills` | `apps/web/src/app/(app)/[tenantSlug]/skills/page.tsx` |
| `/:tenantSlug/tasks` | `apps/web/src/app/(app)/[tenantSlug]/tasks/page.tsx` |
| `/:tenantSlug/tasks/:taskId` | `apps/web/src/app/(app)/[tenantSlug]/tasks/[taskId]/page.tsx` |
| `/:tenantSlug/team` | `apps/web/src/app/(app)/[tenantSlug]/team/page.tsx` |
| `/:tenantSlug/tools` | `apps/web/src/app/(app)/[tenantSlug]/tools/page.tsx` |
| `/cgu` | `apps/web/src/app/(legal)/cgu/page.tsx` |
| `/confidentialite` | `apps/web/src/app/(legal)/confidentialite/page.tsx` |
| `/forgot-password` | `apps/web/src/app/(auth)/forgot-password/page.tsx` |
| `/invitations/accept` | `apps/web/src/app/(auth)/invitations/accept/page.tsx` |
| `/login` | `apps/web/src/app/(auth)/login/page.tsx` |
| `/mentions-legales` | `apps/web/src/app/(legal)/mentions-legales/page.tsx` |
| `/onboarding` | `apps/web/src/app/(app)/onboarding/page.tsx` |
| `/register` | `apps/web/src/app/(auth)/register/page.tsx` |
| `/reset-password` | `apps/web/src/app/(auth)/reset-password/page.tsx` |
| `/workspaces/new` | `apps/web/src/app/(app)/workspaces/new/page.tsx` |

## Environment variables

| Variable | Tracked references |
|---|---|
| `DATABASE_URL` | `apps/web/drizzle.config.ts`<br>`apps/web/src/app/api/[tenantSlug]/work-stream/route.ts`<br>`apps/web/src/db/index.ts`<br>`apps/web/src/modules/work/infrastructure/work-runtime.integration.test.ts`<br>`scripts/migrate-product-db.ts`<br>`scripts/migrate-product-model.ts`<br>`scripts/migrate-runtime-installations.ts`<br>`scripts/migrate-tenant-boundary.ts`<br>`scripts/migrate-work-control-plane.ts`<br>`scripts/reset-product-data.ts` |
| `E2E_BASE_URL` | `apps/web/playwright.config.ts` |
| `E2E_REAL_WORK` | `apps/web/e2e/seed.ts`<br>`apps/web/e2e/work-real.spec.ts`<br>`apps/web/e2e/work.spec.ts` |
| `HERMES_ALLOWED_ORIGINS` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_ALLOWED_VERSIONS` | `apps/gateway/gateway/config.go` |
| `HERMES_BACKUP_DIR` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_BACKUP_ENCRYPTION_KEY` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_BACKUP_RESTORE_ENABLED` | `apps/gateway/gateway/config.go`<br>`infra/dev/compose.yaml` |
| `HERMES_CLI_PATH` | `scripts/install-hermes-console-control.ts` |
| `HERMES_CONSOLE_DOMAIN` | `infra/prod/compose.console.yaml` |
| `HERMES_CONSOLE_URL` | `apps/gateway/gateway/config.go`<br>`apps/web/src/lib/console-url.ts`<br>`apps/web/src/lib/site.ts`<br>`infra/dev/compose.yaml` |
| `HERMES_CONSOLE_WEB_IMAGE` | `infra/prod/compose.console.yaml` |
| `HERMES_CPU_LIMIT` | `infra/dev/compose.yaml` |
| `HERMES_DASHBOARD_SESSION_TOKEN` | `scripts/install-hermes-console-control.ts` |
| `HERMES_DATA_DIR` | `infra/dev/compose.yaml` |
| `HERMES_DB_BACKUP_DIR` | `infra/prod/compose.console.yaml` |
| `HERMES_DEFAULT_GATEWAY_URL` | `apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/app/api/onboarding/complete/route.ts`<br>`apps/web/src/lib/hermes/installations.ts`<br>`scripts/dev-stack.ts`<br>`scripts/migrate-runtime-installations.ts` |
| `HERMES_DEFAULT_INSTALLATION_ID` | `apps/web/src/lib/hermes/installations.ts`<br>`infra/dev/compose.yaml`<br>`scripts/dev-stack.ts`<br>`scripts/migrate-runtime-installations.ts` |
| `HERMES_DEFAULT_INSTALLATION_NAME` | `apps/web/src/lib/hermes/installations.ts`<br>`scripts/migrate-runtime-installations.ts` |
| `HERMES_DEV_LOGIN_EMAIL` | `apps/web/src/modules/auth/infrastructure/auth-service.ts` |
| `HERMES_DEV_LOGIN_PASSWORD` | `apps/web/src/modules/auth/infrastructure/auth-service.ts` |
| `HERMES_EDGE_IDENTITY_DIR` | `infra/prod/compose.edge.yaml` |
| `HERMES_GATEWAY_ALLOWED_HOSTS` | `apps/web/src/lib/hermes/gateway-url.test.ts`<br>`apps/web/src/lib/hermes/gateway-url.ts` |
| `HERMES_GATEWAY_DERIVE_SECRETS` | `apps/web/e2e/work.spec.ts`<br>`apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/gateway-auth.ts`<br>`apps/web/src/lib/hermes/runtime-ticket.ts`<br>`apps/web/src/modules/work/infrastructure/runtime-auth.ts`<br>`scripts/dev-stack.ts`<br>`scripts/maintain-runtime-backups.ts` |
| `HERMES_GATEWAY_ENV` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_GATEWAY_PORT` | `infra/dev/compose.yaml` |
| `HERMES_GATEWAY_SERVICE_SECRET` | `apps/gateway/gateway/config.go`<br>`apps/web/e2e/work.spec.ts`<br>`apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`apps/web/src/modules/work/infrastructure/runtime-auth.ts`<br>`infra/dev/compose.yaml`<br>`scripts/dev-stack.ts`<br>`scripts/maintain-runtime-backups.ts` |
| `HERMES_GATEWAY_TICKET_SECRET` | `apps/gateway/gateway/config.go`<br>`apps/web/e2e/work.spec.ts`<br>`apps/web/scripts/sync-local-runtime-profiles.ts`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`apps/web/src/modules/work/infrastructure/runtime-auth.ts`<br>`infra/dev/compose.yaml`<br>`scripts/dev-stack.ts`<br>`scripts/maintain-runtime-backups.ts` |
| `HERMES_GID` | `infra/dev/compose.yaml`<br>`infra/prod/compose.edge.yaml` |
| `HERMES_HOME` | `apps/web/src/lib/hermes/extension-files.ts`<br>`apps/web/src/lib/hermes/gateway-locks.test.ts`<br>`apps/web/src/lib/hermes/gateway-locks.ts`<br>`apps/web/src/lib/hermes/server.ts` |
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
| `HERMES_RELAY_URL` | `apps/gateway/gateway/config.go`<br>`apps/web/src/app/api/[tenantSlug]/installations/[installationId]/enrollment/route.ts`<br>`apps/web/src/app/api/[tenantSlug]/installations/enroll/route.ts`<br>`apps/web/src/app/api/runtime/enroll/route.ts` |
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
| `MAIL_FROM` | `apps/web/src/lib/mailer.ts` |
| `MOCK_HERMES_PORT` | `scripts/mock-hermes.ts` |
| `NEXT_DIST_DIR` | `apps/web/next.config.ts` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `apps/web/src/lib/support.ts` |
| `NEXT_RUNTIME` | `apps/web/src/instrumentation.ts` |
| `NODE_ENV` | `apps/web/src/app/(auth)/login/page.tsx`<br>`apps/web/src/components/shared/chat/assistant-ui/composer-trigger-popover.tsx`<br>`apps/web/src/db/index.ts`<br>`apps/web/src/lib/auth.ts`<br>`apps/web/src/lib/hermes/gateway-url.ts`<br>`apps/web/src/lib/hermes/relay-identity.ts`<br>`apps/web/src/lib/observability/logger.ts`<br>`apps/web/src/modules/auth/infrastructure/auth-service.ts`<br>`apps/web/src/modules/work/infrastructure/ephemeral-interventions.ts`<br>`apps/web/src/proxy.ts` |
| `POSTGRES_DB` | `infra/prod/compose.console.yaml` |
| `POSTGRES_PASSWORD` | `infra/prod/compose.console.yaml` |
| `POSTGRES_USER` | `infra/prod/compose.console.yaml` |
| `SMTP_HOST` | `apps/web/src/lib/mailer.ts` |
| `SMTP_PASSWORD` | `apps/web/src/lib/mailer.ts` |
| `SMTP_PORT` | `apps/web/src/lib/mailer.ts` |
| `SMTP_SECURE` | `apps/web/src/lib/mailer.ts` |
| `SMTP_USER` | `apps/web/src/lib/mailer.ts` |
| `TAVILY_API_KEY` | `apps/web/src/lib/shared/chat/web-search.ts` |
| `UPLOAD_DIR` | `apps/web/src/app/api/files/route.ts`<br>`apps/web/src/app/api/workspaces/[workspaceId]/route.ts` |
| `WORK_AUTOMATION_CRON_SECRET` | `apps/web/src/app/api/internal/work/automations/cron/route.ts` |
| `XDG_STATE_HOME` | `apps/web/src/lib/hermes/gateway-locks.test.ts`<br>`apps/web/src/lib/hermes/gateway-locks.ts` |

## Migration artifacts

- `apps/web/drizzle.config.ts`
- `apps/web/drizzle/0000_baseline.sql`
- `apps/web/drizzle/0001_work_runtime_functions.sql`
- `apps/web/drizzle/meta/0000_snapshot.json`
- `apps/web/drizzle/meta/_journal.json`
- `scripts/migrate-product-db.ts`
- `scripts/migrate-product-model.ts`
- `scripts/migrate-runtime-installations.ts`
- `scripts/migrate-tenant-boundary.ts`
- `scripts/migrate-work-control-plane.ts`

## Key configuration

- `.env.example`
- `Makefile`
- `apps/gateway/go.mod`
- `apps/gateway/go.sum`
- `apps/gateway/package.json`
- `apps/web/Dockerfile`
- `apps/web/Dockerfile.dockerignore`
- `apps/web/drizzle.config.ts`
- `apps/web/eslint.config.mjs`
- `apps/web/next.config.ts`
- `apps/web/package.json`
- `apps/web/playwright.config.ts`
- `apps/web/tsconfig.json`
- `bun.lock`
- `infra/dev/compose.override.yaml`
- `infra/dev/compose.yaml`
- `infra/prod/compose.console.yaml`
- `infra/prod/compose.edge.yaml`
- `package.json`
- `packages/shared/gatewaycontracts/go.mod`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
