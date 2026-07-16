import {
  type AnyPgColumn,
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export type RuntimeInstallationOrigin =
  "local_managed" | "remote_existing" | "remote_provisioned";
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
    managementLevel: text("management_level")
      .$type<RuntimeManagementLevel>()
      .notNull(),
    transport: text("transport")
      .$type<RuntimeTransport>()
      .notNull()
      .default("direct"),
    gatewayUrl: text("gateway_url").notNull(),
    status: text("status")
      .$type<RuntimeInstallationStatus>()
      .notNull()
      .default("checking"),
    statusDetail: text("status_detail"),
    statusReason: text("status_reason"),
    gatewayProtocolVersion: integer("gateway_protocol_version"),
    hermesVersion: text("hermes_version"),
    detectedRuntime: text("detected_runtime")
      .$type<"systemwide" | "docker" | "unknown">()
      .notNull()
      .default("unknown"),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_installations_tenant_key_uidx").on(
      t.tenantId,
      t.installationKey,
    ),
    index("runtime_installations_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export type RuntimeIdentityStatus =
  "active" | "rotating" | "revoked" | "expired";

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
    status: text("status")
      .$type<RuntimeIdentityStatus>()
      .notNull()
      .default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_identities_fingerprint_uidx").on(t.fingerprint),
    index("runtime_identities_installation_status_idx").on(
      t.installationId,
      t.status,
    ),
  ],
);

export const runtimeWorkNonces = pgTable(
  "runtime_work_nonces",
  {
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.installationId, t.nonce] }),
    index("runtime_work_nonces_expires_idx").on(t.expiresAt),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_enrollment_tokens_hash_uidx").on(t.tokenHash),
    index("runtime_enrollment_tokens_installation_idx").on(
      t.installationId,
      t.expiresAt,
    ),
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
    profiles: jsonb("profiles")
      .$type<
        Array<{
          name: string;
          description?: string;
          provider?: string | null;
          model?: string | null;
          gatewayRunning?: boolean;
        }>
      >()
      .notNull()
      .default([]),
    limits: jsonb("limits").$type<{
      maxFrameBytes?: number;
      requestsPerMinute?: number;
      headroomPercent?: number;
      maxActiveSessions?: number;
    }>(),
    negotiatedAt: timestamp("negotiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_capabilities_installation_uidx").on(t.installationId),
  ],
);

export type RuntimeOperationStatus =
  "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const runtimeOperations = pgTable(
  "runtime_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    status: text("status")
      .$type<RuntimeOperationStatus>()
      .notNull()
      .default("queued"),
    sourceVersion: text("source_version"),
    targetVersion: text("target_version"),
    steps: jsonb("steps")
      .$type<Array<{ name: string; status: string; detail?: string }>>()
      .notNull()
      .default([]),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    backupId: uuid("backup_id"),
    initiatedByUserId: uuid("initiated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("runtime_operations_installation_created_idx").on(
      t.installationId,
      t.createdAt,
    ),
  ],
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
    infrastructureLimitMicros: bigint("infrastructure_limit_micros", {
      mode: "number",
    }),
    inferenceLimitMicros: bigint("inference_limit_micros", { mode: "number" }),
    globalLimitMicros: bigint("global_limit_micros", { mode: "number" }),
    alertThresholdPercent: integer("alert_threshold_percent")
      .notNull()
      .default(80),
    softCapAction: text("soft_cap_action").notNull().default("alert"),
    hardCapAction: text("hard_cap_action").notNull().default("owner_approval"),
    fallbackModel: text("fallback_model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("runtime_budgets_installation_uidx").on(t.installationId),
  ],
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
    heavyLoads: jsonb("heavy_loads").$type<{
      browser?: number;
      mcp?: number;
      cron?: number;
      subagents?: number;
    }>(),
    infrastructureCostMicros: bigint("infrastructure_cost_micros", {
      mode: "number",
    }),
    inferenceCostMicros: bigint("inference_cost_micros", { mode: "number" }),
    costCurrency: text("cost_currency"),
    costSource: text("cost_source").$type<
      "estimated" | "provider_reported" | "invoiced"
    >(),
    confidence: text("confidence").$type<"low" | "medium" | "high">(),
    sampledAt: timestamp("sampled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("runtime_usage_samples_installation_sampled_idx").on(
      t.installationId,
      t.sampledAt,
    ),
  ],
);

export const runtimeBackups = pgTable(
  "runtime_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "cascade" }),
    profileName: text("profile_name").notNull().default("default"),
    status: text("status")
      .$type<"queued" | "running" | "ready" | "failed" | "expired">()
      .notNull()
      .default("queued"),
    encrypted: boolean("encrypted").notNull().default(true),
    storageRef: text("storage_ref"),
    checksumSha256: text("checksum_sha256"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    secretsPolicy: text("secrets_policy")
      .$type<"excluded" | "encrypted">()
      .notNull()
      .default("excluded"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("runtime_backups_installation_created_idx").on(
      t.installationId,
      t.createdAt,
    ),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runtimeInstallationId: uuid("runtime_installation_id").references(
      () => runtimeInstallations.id,
      { onDelete: "restrict" },
    ),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agents_workspace_slug_uidx").on(t.workspaceId, t.slug),
    uniqueIndex("agents_installation_profile_uidx").on(
      t.runtimeInstallationId,
      t.hermesProfileName,
    ),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_sessions_agent_hermes_uidx").on(
      t.agentId,
      t.hermesSessionId,
    ),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProjectStatus =
  "planned" | "active" | "paused" | "completed" | "cancelled";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").$type<ProjectStatus>().notNull().default("planned"),
    leadUserId: uuid("lead_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    leadAgentId: uuid("lead_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("projects_workspace_key_uidx").on(t.workspaceId, t.key),
    index("projects_workspace_status_idx").on(t.workspaceId, t.status),
  ],
);

export type AgentTeamVisibility = "workspace" | "restricted";

export const agentTeams = pgTable(
  "agent_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    leadAgentId: uuid("lead_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    delegationPolicy: jsonb("delegation_policy")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    concurrencyLimit: integer("concurrency_limit").notNull().default(1),
    visibility: text("visibility")
      .$type<AgentTeamVisibility>()
      .notNull()
      .default("workspace"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_teams_workspace_name_uidx").on(t.workspaceId, t.name),
    uniqueIndex("agent_teams_workspace_slug_uidx").on(t.workspaceId, t.slug),
  ],
);

export const agentTeamMembers = pgTable(
  "agent_team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => agentTeams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.agentId] })],
);

export type WorkItemStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";
export type WorkItemPriority = "none" | "low" | "medium" | "high" | "urgent";
export type WorkAssigneeType = "user" | "agent" | "team";
export type WorkReviewPolicy = "none" | "optional" | "required";

export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    number: integer("number").notNull(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<WorkItemStatus>().notNull().default("backlog"),
    priority: text("priority")
      .$type<WorkItemPriority>()
      .notNull()
      .default("none"),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assigneeType: text("assignee_type").$type<WorkAssigneeType>(),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    assigneeTeamId: uuid("assignee_team_id").references(() => agentTeams.id, {
      onDelete: "set null",
    }),
    parentWorkItemId: uuid("parent_work_item_id").references(
      (): AnyPgColumn => workItems.id,
      { onDelete: "set null" },
    ),
    dueAt: timestamp("due_at", { withTimezone: true }),
    reviewPolicy: text("review_policy")
      .$type<WorkReviewPolicy>()
      .notNull()
      .default("optional"),
    legacyTaskId: uuid("legacy_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    firstRunAt: timestamp("first_run_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_items_workspace_number_uidx").on(t.workspaceId, t.number),
    uniqueIndex("work_items_workspace_key_uidx").on(t.workspaceId, t.key),
    uniqueIndex("work_items_legacy_task_uidx").on(t.legacyTaskId),
    index("work_items_workspace_status_updated_idx").on(
      t.workspaceId,
      t.status,
      t.updatedAt,
    ),
    index("work_items_workspace_assignee_idx").on(
      t.workspaceId,
      t.assigneeType,
      t.assigneeAgentId,
    ),
  ],
);

export const workItemLabels = pgTable(
  "work_item_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_item_labels_workspace_name_uidx").on(
      t.workspaceId,
      t.name,
    ),
  ],
);

export const workItemLabelLinks = pgTable(
  "work_item_label_links",
  {
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => workItemLabels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.workItemId, t.labelId] })],
);

export const workSavedViews = pgTable(
  "work_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: jsonb("filters")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_saved_views_workspace_user_name_uidx").on(
      t.workspaceId,
      t.userId,
      t.name,
    ),
  ],
);

export const workItemDependencies = pgTable(
  "work_item_dependencies",
  {
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    dependsOnWorkItemId: uuid("depends_on_work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workItemId, t.dependsOnWorkItemId] })],
);

export type WorkResourceKind = "link" | "file" | "knowledge" | "artifact";

export const workResources = pgTable(
  "work_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    workItemId: uuid("work_item_id").references(() => workItems.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<WorkResourceKind>().notNull(),
    name: text("name").notNull(),
    uri: text("uri").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("work_resources_item_created_idx").on(t.workItemId, t.createdAt),
    index("work_resources_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

export type WorkRunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "waiting_input"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";
export type WorkRunTrigger =
  "assignment" | "mention" | "automation" | "rerun" | "api" | "delegation";

export const workRuns = pgTable(
  "work_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    runtimeInstallationId: uuid("runtime_installation_id")
      .notNull()
      .references(() => runtimeInstallations.id, { onDelete: "restrict" }),
    hermesProfileName: text("hermes_profile_name").notNull(),
    triggerType: text("trigger_type").$type<WorkRunTrigger>().notNull(),
    triggerCommentId: uuid("trigger_comment_id"),
    automationId: uuid("automation_id"),
    originatorUserId: uuid("originator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    parentRunId: uuid("parent_run_id").references(
      (): AnyPgColumn => workRuns.id,
      {
        onDelete: "set null",
      },
    ),
    status: text("status").$type<WorkRunStatus>().notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    maxAttempts: integer("max_attempts").notNull().default(2),
    failureReason: text("failure_reason"),
    claimedByEdgeId: text("claimed_by_edge_id"),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    agentSessionId: uuid("agent_session_id").references(
      () => agentSessions.id,
      {
        onDelete: "set null",
      },
    ),
    hermesSessionId: text("hermes_session_id"),
    prompt: text("prompt").notNull(),
    contextSnapshot: jsonb("context_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    idempotencyKey: text("idempotency_key").notNull(),
    queuedAt: timestamp("queued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    resultSummary: text("result_summary"),
    usage: jsonb("usage").$type<Record<string, unknown>>(),
    costMicros: bigint("cost_micros", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_runs_workspace_idempotency_uidx").on(
      t.workspaceId,
      t.idempotencyKey,
    ),
    index("work_runs_installation_queue_idx").on(
      t.runtimeInstallationId,
      t.status,
      t.queuedAt,
    ),
    index("work_runs_item_created_idx").on(t.workItemId, t.createdAt),
    index("work_runs_lease_idx").on(t.status, t.leaseExpiresAt),
  ],
);

export type WorkPlanStepStatus =
  "pending" | "in_progress" | "completed" | "cancelled";

export const workRunPlanRevisions = pgTable(
  "work_run_plan_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    sourceEventSequence: integer("source_event_sequence").notNull(),
    itemsSnapshot: jsonb("items_snapshot")
      .$type<
        Array<{ id: string; content: string; status: WorkPlanStepStatus }>
      >()
      .notNull(),
    activeStepId: text("active_step_id"),
    diagnostics: jsonb("diagnostics").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_run_plan_revisions_run_sequence_uidx").on(
      t.runId,
      t.sequence,
    ),
    uniqueIndex("work_run_plan_revisions_run_event_uidx").on(
      t.runId,
      t.sourceEventSequence,
    ),
  ],
);

export const workRunPlanSteps = pgTable(
  "work_run_plan_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workRuns.id, { onDelete: "cascade" }),
    hermesStepId: text("hermes_step_id").notNull(),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    status: text("status").$type<WorkPlanStepStatus>().notNull(),
    firstSeenRevisionId: uuid("first_seen_revision_id")
      .notNull()
      .references(() => workRunPlanRevisions.id, { onDelete: "restrict" }),
    lastSeenRevisionId: uuid("last_seen_revision_id")
      .notNull()
      .references(() => workRunPlanRevisions.id, { onDelete: "restrict" }),
    promotedWorkItemId: uuid("promoted_work_item_id").references(
      () => workItems.id,
      {
        onDelete: "set null",
      },
    ),
    delegatedRunId: uuid("delegated_run_id").references(() => workRuns.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_run_plan_steps_run_hermes_uidx").on(
      t.runId,
      t.hermesStepId,
    ),
  ],
);

export const workRunEvents = pgTable(
  "work_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    visibility: text("visibility")
      .$type<"workspace" | "internal">()
      .notNull()
      .default("workspace"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_run_events_run_sequence_uidx").on(t.runId, t.sequence),
    index("work_run_events_run_created_idx").on(t.runId, t.createdAt),
  ],
);

export type WorkCommentAuthorType = "user" | "agent";

export const workItemComments = pgTable(
  "work_item_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    authorType: text("author_type").$type<WorkCommentAuthorType>().notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    sourceRunId: uuid("source_run_id").references(() => workRuns.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("work_item_comments_item_created_idx").on(t.workItemId, t.createdAt),
  ],
);

export type WorkInterventionType =
  | "approval"
  | "clarification"
  | "sudo"
  | "secret"
  | "launch_review"
  | "deliverable_review";
export type WorkInterventionStatus =
  "pending" | "approved" | "rejected" | "answered" | "expired" | "cancelled";

export const workInterventions = pgTable(
  "work_interventions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => workRuns.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    agentSessionId: uuid("agent_session_id").references(
      () => agentSessions.id,
      { onDelete: "set null" },
    ),
    hermesRequestId: text("hermes_request_id").notNull(),
    type: text("type").$type<WorkInterventionType>().notNull(),
    status: text("status")
      .$type<WorkInterventionStatus>()
      .notNull()
      .default("pending"),
    prompt: text("prompt").notNull(),
    safePayload: jsonb("safe_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_interventions_run_request_uidx").on(
      t.runId,
      t.hermesRequestId,
    ),
    index("work_interventions_workspace_status_idx").on(
      t.workspaceId,
      t.status,
      t.createdAt,
    ),
  ],
);

export type WorkAutomationStatus = "active" | "inactive" | "error";
export type WorkAutomationTrigger = "cron" | "webhook" | "event" | "manual";

export const workAutomations = pgTable(
  "work_automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    status: text("status")
      .$type<WorkAutomationStatus>()
      .notNull()
      .default("inactive"),
    triggerType: text("trigger_type").$type<WorkAutomationTrigger>().notNull(),
    triggerConfig: jsonb("trigger_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    timezone: text("timezone").notNull().default("UTC"),
    workItemTemplate: jsonb("work_item_template")
      .$type<Record<string, unknown>>()
      .notNull(),
    assigneeType: text("assignee_type").$type<WorkAssigneeType>().notNull(),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    assigneeTeamId: uuid("assignee_team_id").references(() => agentTeams.id, {
      onDelete: "set null",
    }),
    dedupePolicy: jsonb("dedupe_policy")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    concurrencyPolicy: jsonb("concurrency_policy")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    nextTriggerAt: timestamp("next_trigger_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_automations_workspace_name_uidx").on(
      t.workspaceId,
      t.name,
    ),
  ],
);

export type WorkAutomationRunStatus =
  "running" | "succeeded" | "failed" | "deduplicated";

export const workAutomationRuns = pgTable(
  "work_automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => workAutomations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").$type<WorkAutomationTrigger>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status")
      .$type<WorkAutomationRunStatus>()
      .notNull()
      .default("running"),
    workItemId: uuid("work_item_id").references(() => workItems.id, {
      onDelete: "set null",
    }),
    safePayload: jsonb("safe_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("work_automation_runs_automation_key_uidx").on(
      t.automationId,
      t.idempotencyKey,
    ),
    index("work_automation_runs_workspace_started_idx").on(
      t.workspaceId,
      t.startedAt,
    ),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    reason: text("reason").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inbox_items_user_source_uidx").on(
      t.userId,
      t.type,
      t.sourceType,
      t.sourceId,
    ),
    index("inbox_items_user_read_created_idx").on(
      t.userId,
      t.readAt,
      t.createdAt,
    ),
  ],
);

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatSessionId: uuid("chat_session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").$type<"system" | "user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memoryItems = pgTable("memory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source").notNull().default("seed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, {
    onDelete: "cascade",
  }),
  agentSessionId: uuid("agent_session_id").references(() => agentSessions.id, {
    onDelete: "set null",
  }),
  hermesRequestId: text("hermes_request_id"),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload"),
  status: text("status")
    .$type<"pending" | "approved" | "rejected">()
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const xuluxThreads = pgTable(
  "xulux_threads",
  {
    // Client-generated opaque id (e.g. "__LOCALID_…" from @assistant-ui/core) — not a UUID.
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    status: text("status")
      .$type<"regular" | "archived">()
      .notNull()
      .default("regular"),
    custom: jsonb("custom").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("xulux_thread_messages_thread_created_idx").on(
      t.threadId,
      t.createdAt,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type RuntimeInstallation = typeof runtimeInstallations.$inferSelect;
export type RuntimeIdentity = typeof runtimeIdentities.$inferSelect;
export type RuntimeWorkNonce = typeof runtimeWorkNonces.$inferSelect;
export type RuntimeEnrollmentToken =
  typeof runtimeEnrollmentTokens.$inferSelect;
export type RuntimeCapability = typeof runtimeCapabilities.$inferSelect;
export type RuntimeOperation = typeof runtimeOperations.$inferSelect;
export type RuntimeBudget = typeof runtimeBudgets.$inferSelect;
export type RuntimeUsageSample = typeof runtimeUsageSamples.$inferSelect;
export type RuntimeBackup = typeof runtimeBackups.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type AgentTeam = typeof agentTeams.$inferSelect;
export type AgentTeamMember = typeof agentTeamMembers.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
export type WorkItemLabel = typeof workItemLabels.$inferSelect;
export type WorkRun = typeof workRuns.$inferSelect;
export type WorkRunPlanRevision = typeof workRunPlanRevisions.$inferSelect;
export type WorkRunPlanStep = typeof workRunPlanSteps.$inferSelect;
export type WorkRunEvent = typeof workRunEvents.$inferSelect;
export type WorkItemComment = typeof workItemComments.$inferSelect;
export type WorkIntervention = typeof workInterventions.$inferSelect;
export type WorkAutomation = typeof workAutomations.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type MemoryItem = typeof memoryItems.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type XuluxThread = typeof xuluxThreads.$inferSelect;
export type XuluxThreadMessage = typeof xuluxThreadMessages.$inferSelect;
