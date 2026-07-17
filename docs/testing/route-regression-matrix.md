# Route regression matrix

The path and method columns are the frozen public contract. Payload and authorization checks must compare against the pre-migration behavior.

| Priority | Methods | Route | Authentication | Contract smoke |
|---|---|---|---|---|
| standard | GET, POST | `/api/:tenantSlug/agent-teams` | preserve current guard | status + response shape + side effects |
| standard | DELETE | `/api/:tenantSlug/agent-teams/:teamId` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/agents` | preserve current guard | status + response shape + side effects |
| critical | DELETE, PATCH | `/api/:tenantSlug/agents/:agentSlug` | preserve current guard | status + response shape + side effects |
| critical | DELETE, GET, PUT | `/api/:tenantSlug/agents/:agentSlug/inference` | preserve current guard | status + response shape + side effects |
| critical | DELETE, GET, POST | `/api/:tenantSlug/agents/:agentSlug/inference/codex` | preserve current guard | status + response shape + side effects |
| critical | GET, POST, PUT | `/api/:tenantSlug/agents/:agentSlug/messaging` | preserve current guard | status + response shape + side effects |
| critical | GET | `/api/:tenantSlug/agents/:agentSlug/runtime-status` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/agents/:agentSlug/runtime-ticket` | preserve current guard | status + response shape + side effects |
| critical | GET, POST | `/api/:tenantSlug/agents/:agentSlug/sessions` | preserve current guard | status + response shape + side effects |
| critical | DELETE, GET, PATCH | `/api/:tenantSlug/agents/:agentSlug/sessions/:sessionId` | preserve current guard | status + response shape + side effects |
| critical | GET | `/api/:tenantSlug/agents/:agentSlug/sessions/:sessionId/metrics` | preserve current guard | status + response shape + side effects |
| standard | GET, POST | `/api/:tenantSlug/automations` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/automations/:automationId/run` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/:tenantSlug/events` | preserve current guard | status + response shape + side effects |
| standard | GET, PATCH | `/api/:tenantSlug/inbox` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/installations` | preserve current guard | status + response shape + side effects |
| critical | GET, PATCH | `/api/:tenantSlug/installations/:installationId` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/installations/:installationId/backups` | preserve current guard | status + response shape + side effects |
| critical | PUT | `/api/:tenantSlug/installations/:installationId/budget` | preserve current guard | status + response shape + side effects |
| critical | PUT | `/api/:tenantSlug/installations/:installationId/capacity-policy` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/installations/:installationId/enrollment` | preserve current guard | status + response shape + side effects |
| critical | GET, POST | `/api/:tenantSlug/installations/:installationId/operations` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/installations/:installationId/upgrades` | preserve current guard | status + response shape + side effects |
| critical | DELETE, POST | `/api/:tenantSlug/installations/enroll` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/installations/preflight` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/:tenantSlug/interventions` | preserve current guard | status + response shape + side effects |
| standard | PATCH | `/api/:tenantSlug/interventions/:interventionId` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/invitations` | preserve current guard | status + response shape + side effects |
| standard | DELETE | `/api/:tenantSlug/invitations/:invitationId` | preserve current guard | status + response shape + side effects |
| standard | DELETE, PATCH | `/api/:tenantSlug/members/:memberUserId` | preserve current guard | status + response shape + side effects |
| standard | GET, POST | `/api/:tenantSlug/projects` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/projects/:projectId/resources` | preserve current guard | status + response shape + side effects |
| standard | DELETE | `/api/:tenantSlug/resources/:resourceId` | preserve current guard | status + response shape + side effects |
| standard | PUT | `/api/:tenantSlug/runtime/config` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/skills` | preserve current guard | status + response shape + side effects |
| standard | GET, PUT | `/api/:tenantSlug/skills/content` | preserve current guard | status + response shape + side effects |
| standard | PUT | `/api/:tenantSlug/skills/toggle` | preserve current guard | status + response shape + side effects |
| standard | PUT | `/api/:tenantSlug/tools/toolsets/:name` | preserve current guard | status + response shape + side effects |
| standard | GET, POST | `/api/:tenantSlug/work-items` | preserve current guard | status + response shape + side effects |
| standard | DELETE, GET, PATCH | `/api/:tenantSlug/work-items/:workItemId` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/work-items/:workItemId/assign` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/work-items/:workItemId/cancel` | preserve current guard | status + response shape + side effects |
| standard | GET, POST | `/api/:tenantSlug/work-items/:workItemId/comments` | preserve current guard | status + response shape + side effects |
| standard | DELETE, POST | `/api/:tenantSlug/work-items/:workItemId/dependencies` | preserve current guard | status + response shape + side effects |
| standard | DELETE, POST | `/api/:tenantSlug/work-items/:workItemId/labels` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/work-items/:workItemId/resources` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/work-items/:workItemId/runs` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/:tenantSlug/work-items/:workItemId/timeline` | preserve current guard | status + response shape + side effects |
| standard | GET, POST | `/api/:tenantSlug/work-labels` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/work-runs/:runId/cancel` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/:tenantSlug/work-runs/:runId/plan-steps/:stepId/promote` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/:tenantSlug/work-stream` | preserve current guard | status + response shape + side effects |
| standard | DELETE, GET, POST | `/api/:tenantSlug/work-views` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/account/export` | preserve current guard | status + response shape + side effects |
| standard | PATCH | `/api/approvals/:approvalId` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/auth/forgot-password` | public/session mutation | status + response shape + side effects |
| critical | POST | `/api/auth/login` | public/session mutation | status + response shape + side effects |
| critical | POST | `/api/auth/logout` | public/session mutation | status + response shape + side effects |
| critical | POST | `/api/auth/register` | public/session mutation | status + response shape + side effects |
| critical | POST | `/api/auth/reset-password` | public/session mutation | status + response shape + side effects |
| standard | POST | `/api/files` | preserve current guard | status + response shape + side effects |
| standard | DELETE, GET | `/api/files/:fileId` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/healthz` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/internal/work/automations/cron` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/invitations/accept` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/onboarding/complete` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/onboarding/runtime` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/runtime/enroll` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/claim` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/runs/:runId/complete` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/runs/:runId/events` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/runs/:runId/heartbeat` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/runs/:runId/interventions` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/runs/:runId/release` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/runtime/work/runs/:runId/start` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/tasks` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/tasks/:taskId/run` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/work-hooks/:automationId` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/workspaces` | preserve current guard | status + response shape + side effects |
| standard | DELETE, PATCH | `/api/workspaces/:workspaceId` | preserve current guard | status + response shape + side effects |
