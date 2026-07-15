# Route regression matrix

The path and method columns are the frozen public contract. Payload and authorization checks must compare against the pre-migration behavior.

| Priority | Methods | Route | Authentication | Contract smoke |
|---|---|---|---|---|
| critical | POST | `/api/:tenantSlug/:workspaceSlug/agents` | preserve current guard | status + response shape + side effects |
| critical | DELETE, GET, PUT | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/inference` | preserve current guard | status + response shape + side effects |
| critical | DELETE, GET, POST | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/inference/codex` | preserve current guard | status + response shape + side effects |
| critical | GET, POST, PUT | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/messaging` | preserve current guard | status + response shape + side effects |
| critical | GET | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/runtime-status` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/runtime-ticket` | preserve current guard | status + response shape + side effects |
| critical | GET, POST | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/sessions` | preserve current guard | status + response shape + side effects |
| critical | DELETE, GET, PATCH | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/sessions/:sessionId` | preserve current guard | status + response shape + side effects |
| critical | GET | `/api/:tenantSlug/:workspaceSlug/agents/:agentSlug/sessions/:sessionId/metrics` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/:tenantSlug/:workspaceSlug/events` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/:workspaceSlug/installations` | preserve current guard | status + response shape + side effects |
| critical | GET, PATCH | `/api/:tenantSlug/:workspaceSlug/installations/:installationId` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/backups` | preserve current guard | status + response shape + side effects |
| critical | PUT | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/budget` | preserve current guard | status + response shape + side effects |
| critical | PUT | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/capacity-policy` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/enrollment` | preserve current guard | status + response shape + side effects |
| critical | GET, POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/operations` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/:workspaceSlug/installations/:installationId/upgrades` | preserve current guard | status + response shape + side effects |
| critical | DELETE, POST | `/api/:tenantSlug/:workspaceSlug/installations/enroll` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/:tenantSlug/:workspaceSlug/installations/preflight` | preserve current guard | status + response shape + side effects |
| standard | PUT | `/api/:tenantSlug/:workspaceSlug/runtime/config` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/:tenantSlug/:workspaceSlug/skills/content` | preserve current guard | status + response shape + side effects |
| standard | PUT | `/api/:tenantSlug/:workspaceSlug/tools/toolsets/:name` | preserve current guard | status + response shape + side effects |
| standard | PATCH | `/api/approvals/:approvalId` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/auth/login` | public/session mutation | status + response shape + side effects |
| critical | POST | `/api/auth/logout` | public/session mutation | status + response shape + side effects |
| critical | POST | `/api/auth/register` | public/session mutation | status + response shape + side effects |
| standard | POST | `/api/files` | preserve current guard | status + response shape + side effects |
| standard | DELETE, GET | `/api/files/:fileId` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/onboarding/complete` | preserve current guard | status + response shape + side effects |
| standard | GET | `/api/onboarding/runtime` | preserve current guard | status + response shape + side effects |
| critical | POST | `/api/runtime/enroll` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/tasks` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/tasks/:taskId/run` | preserve current guard | status + response shape + side effects |
| standard | POST | `/api/workspaces` | preserve current guard | status + response shape + side effects |
| standard | DELETE, PATCH | `/api/workspaces/:workspaceId` | preserve current guard | status + response shape + side effects |
