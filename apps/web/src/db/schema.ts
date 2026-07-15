import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { WorkspacePermissions } from "@/lib/permissions";
import type { TaskKind, TaskStatus } from "@/lib/task-templates";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  onboardingData: jsonb("onboarding_data").$type<{
    agentTemplate?: string;
    organizationName?: string;
    workspaceName?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Kept during the legacy chat migration. Hermes runtime configuration is
    // installation-level now; it no longer belongs to a workspace.
    hermesBaseUrl: text("hermes_base_url").notNull(),
    hermesApiKey: text("hermes_api_key"),
    permissions: jsonb("permissions").$type<WorkspacePermissions>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspaces_tenant_slug_uidx").on(t.tenantId, t.slug)],
);

export type MembershipRole = "owner" | "member" | "viewer";

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MembershipRole>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId] })],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // A workspace can override the inherited tenant role or explicitly deny it.
    role: text("role").$type<MembershipRole>(),
    denied: boolean("denied").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export type RuntimeInstallationOrigin = "local_managed" | "remote_existing" | "remote_provisioned";
export type RuntimeManagementLevel = "external" | "connected" | "managed";
export type RuntimeTransport = "direct" | "relay";
export type RuntimeInstallationStatus =
  | "pending_enrollment"
  | "checking"
  | "ready"
  | "degraded"
  | "offline"
  | "incompatible"
  | "upgrading"
  | "rollback_required"
  | "revoked";

export const runtimeInstallations = pgTable(
  "runtime_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    installationKey: text("installation_key").notNull(),
    origin: text("origin").$type<RuntimeInstallationOrigin>().notNull(),
    managementLevel: text("management_level").$type<RuntimeManagementLevel>().notNull(),
    transport: text("transport").$type<RuntimeTransport>().notNull().default("direct"),
    gatewayUrl: text("gateway_url").notNull(),
    status: text("status").$type<RuntimeInstallationStatus>().notNull().default("checking"),
    statusDetail: text("status_detail"),
    statusReason: text("status_reason"),
    gatewayProtocolVersion: integer("gateway_protocol_version"),
    hermesVersion: text("hermes_version"),
    detectedRuntime: text("detected_runtime").$type<"systemwide" | "docker" | "unknown">().notNull().default("unknown"),
    provider: text("provider"),
    providerResourceId: text("provider_resource_id"),
    region: text("region"),
    capabilities: jsonb("capabilities").$type<{
      protocolVersion?: number;
      features?: string[];
      runtimeVersion?: string;
    }>(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_installations_tenant_key_uidx").on(t.tenantId, t.installationKey),
    index("runtime_installations_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export type RuntimeIdentityStatus = "active" | "rotating" | "revoked" | "expired";

export const runtimeIdentities = pgTable(
  "runtime_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    certificatePem: text("certificate_pem"),
    status: text("status").$type<RuntimeIdentityStatus>().notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_identities_fingerprint_uidx").on(t.fingerprint),
    index("runtime_identities_installation_status_idx").on(t.installationId, t.status),
  ],
);

export const runtimeEnrollmentTokens = pgTable(
  "runtime_enrollment_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_enrollment_tokens_hash_uidx").on(t.tokenHash),
    index("runtime_enrollment_tokens_installation_idx").on(t.installationId, t.expiresAt),
  ],
);

export const runtimeCapabilities = pgTable(
  "runtime_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    protocolVersion: integer("protocol_version").notNull(),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    lifecycle: jsonb("lifecycle").$type<string[]>().notNull().default([]),
    profiles: jsonb("profiles").$type<Array<{
      name: string;
      description?: string;
      provider?: string | null;
      model?: string | null;
      gatewayRunning?: boolean;
    }>>().notNull().default([]),
    limits: jsonb("limits").$type<{
      maxFrameBytes?: number;
      requestsPerMinute?: number;
      headroomPercent?: number;
      maxActiveSessions?: number;
    }>(),
    negotiatedAt: timestamp("negotiated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("runtime_capabilities_installation_uidx").on(t.installationId)],
);

export type RuntimeOperationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const runtimeOperations = pgTable(
  "runtime_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    status: text("status").$type<RuntimeOperationStatus>().notNull().default("queued"),
    sourceVersion: text("source_version"),
    targetVersion: text("target_version"),
    steps: jsonb("steps").$type<Array<{ name: string; status: string; detail?: string }>>().notNull().default([]),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    backupId: uuid("backup_id"),
    initiatedByUserId: uuid("initiated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("runtime_operations_installation_created_idx").on(t.installationId, t.createdAt)],
);

export const runtimeBudgets = pgTable(
  "runtime_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    currency: text("currency").notNull().default("EUR"),
    period: text("period").notNull().default("monthly"),
    infrastructureLimitMicros: bigint("infrastructure_limit_micros", { mode: "number" }),
    inferenceLimitMicros: bigint("inference_limit_micros", { mode: "number" }),
    globalLimitMicros: bigint("global_limit_micros", { mode: "number" }),
    alertThresholdPercent: integer("alert_threshold_percent").notNull().default(80),
    softCapAction: text("soft_cap_action").notNull().default("alert"),
    hardCapAction: text("hard_cap_action").notNull().default("owner_approval"),
    fallbackModel: text("fallback_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("runtime_budgets_installation_uidx").on(t.installationId)],
);

export const runtimeUsageSamples = pgTable(
  "runtime_usage_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    cpuPercentBasisPoints: integer("cpu_percent_basis_points"),
    memoryUsedBytes: bigint("memory_used_bytes", { mode: "number" }),
    memoryTotalBytes: bigint("memory_total_bytes", { mode: "number" }),
    diskUsedBytes: bigint("disk_used_bytes", { mode: "number" }),
    diskTotalBytes: bigint("disk_total_bytes", { mode: "number" }),
    profileCount: integer("profile_count"),
    activeSessionCount: integer("active_session_count"),
    heavyLoads: jsonb("heavy_loads").$type<{ browser?: number; mcp?: number; cron?: number; subagents?: number }>(),
    infrastructureCostMicros: bigint("infrastructure_cost_micros", { mode: "number" }),
    inferenceCostMicros: bigint("inference_cost_micros", { mode: "number" }),
    costCurrency: text("cost_currency"),
    costSource: text("cost_source").$type<"estimated" | "provider_reported" | "invoiced">(),
    confidence: text("confidence").$type<"low" | "medium" | "high">(),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("runtime_usage_samples_installation_sampled_idx").on(t.installationId, t.sampledAt)],
);

export const runtimeBackups = pgTable(
  "runtime_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    profileName: text("profile_name").notNull().default("default"),
    status: text("status").$type<"queued" | "running" | "ready" | "failed" | "expired">().notNull().default("queued"),
    encrypted: boolean("encrypted").notNull().default(true),
    storageRef: text("storage_ref"),
    checksumSha256: text("checksum_sha256"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    secretsPolicy: text("secrets_policy").$type<"excluded" | "encrypted">().notNull().default("excluded"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("runtime_backups_installation_created_idx").on(t.installationId, t.createdAt)],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runtimeInstallationId: uuid("runtime_installation_id")
      .references(() => runtimeInstallations.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    hermesProfileName: text("hermes_profile_name").notNull(),
    runtimeState: text("runtime_state")
      .$type<"ready" | "setup_required" | "error">()
      .notNull()
      .default("setup_required"),
    runtimeError: text("runtime_error"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agents_workspace_slug_uidx").on(t.workspaceId, t.slug),
    uniqueIndex("agents_installation_profile_uidx").on(t.runtimeInstallationId, t.hermesProfileName),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    hermesSessionId: text("hermes_session_id").notNull(),
    title: text("title"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_sessions_agent_hermes_uidx").on(t.agentId, t.hermesSessionId),
    index("agent_sessions_agent_activity_idx").on(t.agentId, t.lastActivityAt),
  ],
);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind").$type<TaskKind>().notNull(),
  status: text("status").$type<TaskStatus>().notNull().default("draft"),
  input: text("input").notNull(),
  output: text("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatSessionId: uuid("chat_session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").$type<"system" | "user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  storedPath: text("stored_path").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memoryItems = pgTable("memory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source").notNull().default("seed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  agentSessionId: uuid("agent_session_id").references(() => agentSessions.id, {
    onDelete: "set null",
  }),
  hermesRequestId: text("hermes_request_id"),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload"),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

export const xuluxThreads = pgTable(
  "xulux_threads",
  {
    // Client-generated opaque id (e.g. "__LOCALID_…" from @assistant-ui/core) — not a UUID.
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    title: text("title"),
    status: text("status").$type<"regular" | "archived">().notNull().default("regular"),
    custom: jsonb("custom").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("xulux_threads_ws_updated_idx").on(t.workspaceId, t.updatedAt),
    index("xulux_threads_workspace_agent_updated_idx").on(
      t.workspaceId,
      t.agentId,
      t.updatedAt,
    ),
  ],
);

export const xuluxThreadMessages = pgTable(
  "xulux_thread_messages",
  {
    // ai-sdk message id, provided by the client.
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => xuluxThreads.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    format: text("format").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("xulux_thread_messages_thread_created_idx").on(t.threadId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type RuntimeInstallation = typeof runtimeInstallations.$inferSelect;
export type RuntimeIdentity = typeof runtimeIdentities.$inferSelect;
export type RuntimeEnrollmentToken = typeof runtimeEnrollmentTokens.$inferSelect;
export type RuntimeCapability = typeof runtimeCapabilities.$inferSelect;
export type RuntimeOperation = typeof runtimeOperations.$inferSelect;
export type RuntimeBudget = typeof runtimeBudgets.$inferSelect;
export type RuntimeUsageSample = typeof runtimeUsageSamples.$inferSelect;
export type RuntimeBackup = typeof runtimeBackups.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type MemoryItem = typeof memoryItems.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type XuluxThread = typeof xuluxThreads.$inferSelect;
export type XuluxThreadMessage = typeof xuluxThreadMessages.$inferSelect;
