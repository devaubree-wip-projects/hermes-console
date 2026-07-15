import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureHermesConsoleControlExtension } from "@/lib/hermes/console-control-extension";
import {
  hermesFetch,
  HermesRuntimeError,
  readLocalProfileGatewayPlatforms,
  runLocalHermesGatewayCommand,
} from "@/lib/hermes/server";
import { isProfileGatewayRunning, resolvedPlatformState } from "@/lib/hermes/messaging-status";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

const SUPPORTED_PLATFORMS = ["telegram", "discord"] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

type HermesMessagingEnv = {
  key?: string;
  required?: boolean;
  is_set?: boolean;
  redacted_value?: string | null;
  description?: string;
  prompt?: string;
  help?: string;
  url?: string | null;
  is_password?: boolean;
  advanced?: boolean;
};

type HermesMessagingPlatform = {
  id?: string;
  name?: string;
  description?: string;
  docs_url?: string;
  enabled?: boolean;
  configured?: boolean;
  gateway_running?: boolean;
  state?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  updated_at?: string | null;
  env_vars?: HermesMessagingEnv[];
};

type HermesMessagingResponse = {
  gateway_start_command?: string;
  platforms?: HermesMessagingPlatform[];
};

type HermesGatewayTopology = {
  gateway_running?: boolean;
  gateway_platforms?: Record<string, {
    state?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    updated_at?: string | null;
  }>;
  gateways?: Array<{
    profile?: string;
    served_profiles?: string[];
    ports?: Record<string, unknown>;
  }>;
};

type TelegramOnboardingStart = {
  pairing_id: string;
  suggested_username: string;
  deep_link: string;
  qr_payload: string;
  expires_at: string;
};

type TelegramOnboardingStatus =
  | { status: "waiting"; expires_at: string }
  | {
      status: "ready";
      bot_username?: string | null;
      owner_user_id?: string | null;
      expires_at: string;
    };

function isSupportedPlatform(value: unknown): value is SupportedPlatform {
  return typeof value === "string" && SUPPORTED_PLATFORMS.includes(value as SupportedPlatform);
}

function normalizedPairingId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[a-zA-Z0-9_-]{1,200}$/.test(normalized) ? normalized : null;
}

function activeBotName(agentName: string) {
  return `${agentName.trim() || "Assistant"} via Hermes`.slice(0, 64);
}

function runtimeErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Runtime Hermes indisponible.";
  const status = error instanceof HermesRuntimeError && error.status
    ? Math.min(Math.max(error.status, 400), 599)
    : 503;
  return NextResponse.json({ error: message }, { status });
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Runtime Hermes indisponible.";
  return message
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, "[credential redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/TELEGRAM_BOT_TOKEN=\S+/gi, "TELEGRAM_BOT_TOKEN=[redacted]")
    .slice(0, 500);
}

async function recordMessagingEvent(input: {
  tenantId: string;
  workspaceId: string;
  userId: string;
  agentId: string;
  action: string;
  metadata: Record<string, unknown>;
}) {
  try {
    await db.insert(auditEvents).values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      action: input.action,
      targetType: "agent",
      targetId: input.agentId,
      metadata: input.metadata,
    });
  } catch {
    // Observability must never prevent the requested Hermes action from completing.
  }
}

async function resolveContext(
  tenantSlug: string,
  workspaceSlug: string,
  agentSlug: string,
) {
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return { user, access: null, agent: null };
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)))
    .limit(1);
  return { user, access, agent: agent ?? null };
}

function scopedPath(path: string, profile: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}profile=${encodeURIComponent(profile)}`;
}

async function loadPlatforms(agentId: string, profile: string) {
  const scope = { agentId, profile };
  const [response, topology, localState] = await Promise.all([
    hermesFetch<HermesMessagingResponse>(scopedPath("/api/messaging/platforms", profile), {}, scope),
    hermesFetch<HermesGatewayTopology>(scopedPath("/api/status", profile), {}, scope).catch(
      (): HermesGatewayTopology => ({}),
    ),
    readLocalProfileGatewayPlatforms(profile),
  ]);
  const gatewayRunning = isProfileGatewayRunning({
    profile,
    topology: {
      gatewayRunning: topology.gateway_running,
      gateways: topology.gateways?.map((gateway) => ({
        profile: gateway.profile,
        servedProfiles: gateway.served_profiles,
      })),
    },
    localRunning: localState?.running,
    platformReportedRunning: (response.platforms ?? []).some(
      (platform) => platform.gateway_running === true,
    ),
  });
  return {
    gatewayStartCommand: response.gateway_start_command ?? `hermes -p ${profile} gateway start`,
    platforms: (response.platforms ?? []).filter(
      (platform): platform is HermesMessagingPlatform & { id: SupportedPlatform } => (
        isSupportedPlatform(platform.id)
      ),
    ).map((platform) => {
      const topologyState = topology.gateway_platforms?.[platform.id];
      const platformGatewayRunning = gatewayRunning;
      const fallbackState = gatewayRunning ? localState?.platforms[platform.id] : null;
      const runtimeState = topologyState ?? (fallbackState ? {
        state: fallbackState.state,
        error_code: fallbackState.errorCode,
        error_message: fallbackState.errorMessage,
        updated_at: fallbackState.updatedAt,
      } : null);
      return {
        ...platform,
        gateway_running: platformGatewayRunning,
        state: resolvedPlatformState({
          topologyState: topologyState?.state,
          localState: fallbackState?.state,
          platformState: platform.state,
          gatewayRunning: platformGatewayRunning,
          enabled: platform.enabled,
          configured: platform.configured,
        }),
        error_code: runtimeState?.error_code ?? platform.error_code,
        error_message: runtimeState?.error_message ?? platform.error_message,
        updated_at: runtimeState?.updated_at ?? platform.updated_at,
      };
    }),
  };
}

async function waitForMessagingState(agentId: string, profile: string, platformId: SupportedPlatform) {
  const deadline = Date.now() + 12_000;
  let latest: Awaited<ReturnType<typeof loadPlatforms>>["platforms"][number] | undefined;
  do {
    const current = await loadPlatforms(agentId, profile);
    latest = current.platforms.find((platform) => platform.id === platformId);
    if (latest?.state === "connected" || latest?.error_message) return latest;
    await new Promise((resolve) => setTimeout(resolve, 400));
  } while (Date.now() < deadline);
  return latest;
}

function numericIdList(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} invalide.`);
  const normalized = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (normalized.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`${label} doit contenir uniquement des identifiants numériques séparés par des virgules.`);
  }
  return normalized.join(",");
}

function tokenKey(platform: SupportedPlatform) {
  return platform === "telegram" ? "TELEGRAM_BOT_TOKEN" : "DISCORD_BOT_TOKEN";
}

function allowedUsersKey(platform: SupportedPlatform) {
  return platform === "telegram" ? "TELEGRAM_ALLOWED_USERS" : "DISCORD_ALLOWED_USERS";
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const { access, agent } = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });

  try {
    const messaging = await loadPlatforms(agent.id, agent.hermesProfileName);
    return NextResponse.json({
      agent: { id: agent.id, name: agent.name, slug: agent.slug },
      canEdit: canConfigureRuntime(access.role),
      ...messaging,
    });
  } catch (error) {
    return runtimeErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const { user, access, agent } = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut configurer les channels." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    platform?: unknown;
    enabled?: unknown;
    token?: unknown;
    allowedUsers?: unknown;
    replyMode?: unknown;
  } | null;
  if (!isSupportedPlatform(body?.platform)) {
    return NextResponse.json({ error: "Channel non pris en charge." }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "État du channel invalide." }, { status: 400 });
  }

  const platform = body.platform;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  let allowedUsers: string | undefined;
  try {
    allowedUsers = numericIdList(body.allowedUsers, "La liste des utilisateurs autorisés");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Liste invalide." },
      { status: 400 },
    );
  }

  const replyMode = typeof body.replyMode === "string" ? body.replyMode.trim() : "";
  if (platform === "discord" && replyMode && !["off", "first", "all"].includes(replyMode)) {
    return NextResponse.json({ error: "Mode de réponse Discord invalide." }, { status: 400 });
  }

  await recordMessagingEvent({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    userId: user.id,
    agentId: agent.id,
    action: "messaging.connection_requested",
    metadata: { platform, enabled: body.enabled },
  });

  let stage = "credential_check";
  try {
    if (body.enabled && !token) {
      const current = await loadPlatforms(agent.id, agent.hermesProfileName);
      const currentPlatform = current.platforms.find((item) => item.id === platform);
      const credentialSet = currentPlatform?.env_vars?.some(
        (entry) => entry.key === tokenKey(platform) && entry.is_set,
      );
      if (!credentialSet) {
        await recordMessagingEvent({
          tenantId: access.tenant.id,
          workspaceId: access.workspace.id,
          userId: user.id,
          agentId: agent.id,
          action: "messaging.failed",
          metadata: { platform, state: stage, error: "Le token du bot est requis." },
        });
        return NextResponse.json({ error: "Le token du bot est requis." }, { status: 400 });
      }
    }

    stage = "control_extension";
    if (platform === "telegram" && body.enabled) {
      await ensureHermesConsoleControlExtension(agent.id, agent.hermesProfileName);
    }

    const env: Record<string, string> = {};
    if (token) env[tokenKey(platform)] = token;
    if (allowedUsers) env[allowedUsersKey(platform)] = allowedUsers;
    if (platform === "discord" && replyMode) env.DISCORD_REPLY_TO_MODE = replyMode;

    stage = "platform_configuration";
    await hermesFetch<{ ok: boolean }>(
      scopedPath(`/api/messaging/platforms/${platform}`, agent.hermesProfileName),
      {
        method: "PUT",
        body: JSON.stringify({
          profile: agent.hermesProfileName,
          enabled: body.enabled,
          env,
        }),
      },
      { agentId: agent.id, profile: agent.hermesProfileName },
    );

    const beforeLifecycle = await loadPlatforms(agent.id, agent.hermesProfileName);
    const lifecycleAction = beforeLifecycle.platforms.some((item) => item.gateway_running)
      ? "restart"
      : "start";
    let restartWarning: string | null = null;
    stage = "gateway_lifecycle";
    try {
      await runLocalHermesGatewayCommand(agent.id, agent.hermesProfileName, lifecycleAction);
    } catch (error) {
      restartWarning = error instanceof Error ? error.message : "Redémarrage du gateway impossible.";
    }

    stage = "runtime_verification";
    const runtimePlatform = restartWarning
      ? undefined
      : body.enabled
        ? await waitForMessagingState(agent.id, agent.hermesProfileName, platform)
        : (await loadPlatforms(agent.id, agent.hermesProfileName)).platforms.find(
            (item) => item.id === platform,
          );

    const eventAction = !body.enabled
      ? "messaging.disabled"
      : runtimePlatform?.state === "connected"
        ? "messaging.connected"
        : restartWarning
          ? "messaging.failed"
          : "messaging.pending";
    await recordMessagingEvent({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      userId: user.id,
      agentId: agent.id,
      action: eventAction,
      metadata: {
        platform,
        lifecycleAction,
        runtimeState: runtimePlatform?.state ?? null,
        restartWarning: restartWarning ? safeErrorMessage(new Error(restartWarning)) : null,
      },
    });

    return NextResponse.json({
      ok: runtimePlatform?.state === "connected" || (!body.enabled && restartWarning === null),
      platform,
      state: runtimePlatform?.state ?? null,
      restartWarning,
    });
  } catch (error) {
    await recordMessagingEvent({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      userId: user.id,
      agentId: agent.id,
      action: "messaging.failed",
      metadata: { platform, state: stage, error: safeErrorMessage(error) },
    });
    return runtimeErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const { user, access, agent } = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut piloter le gateway." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    action?: unknown;
    platform?: unknown;
    pairingId?: unknown;
    allowedUserIds?: unknown;
  } | null;

  try {
    if (body?.action === "test") {
      if (!isSupportedPlatform(body.platform)) {
        return NextResponse.json({ error: "Channel non pris en charge." }, { status: 400 });
      }
      const result = await hermesFetch<{
        ok?: boolean;
        state?: string;
        message?: string;
      }>(
        scopedPath(`/api/messaging/platforms/${body.platform}/test`, agent.hermesProfileName),
        { method: "POST" },
        { agentId: agent.id, profile: agent.hermesProfileName },
      );
      const current = await loadPlatforms(agent.id, agent.hermesProfileName);
      const platform = current.platforms.find((item) => item.id === body.platform);
      let normalizedResult = result;
      if (platform?.gateway_running && platform.state === "connected" && result.ok !== true) {
        normalizedResult = {
          ok: true,
          state: "connected",
          message: "Connexion active avec le gateway Hermes.",
        };
      } else if (result.state === "gateway_stopped") {
        if (platform?.gateway_running && platform.state === "connected") {
          normalizedResult = {
            ok: true,
            state: "connected",
            message: "Connexion active avec le gateway Hermes.",
          };
        } else {
          normalizedResult = {
            ...result,
            message: "Le gateway est arrêté. Démarre-le pour connecter ce channel.",
          };
        }
      } else if (result.state === "disabled") {
        normalizedResult = {
          ...result,
          message: "Ce channel est désactivé. Active-le puis redémarre le gateway.",
        };
      }
      await recordMessagingEvent({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        userId: user.id,
        agentId: agent.id,
        action: normalizedResult.ok === true ? "messaging.tested" : "messaging.test_failed",
        metadata: {
          platform: body.platform,
          state: normalizedResult.state ?? platform?.state ?? null,
          detail: normalizedResult.message ?? null,
        },
      });
      return NextResponse.json(normalizedResult);
    }

    if (body?.action === "telegram_onboarding_start") {
      const result = await hermesFetch<TelegramOnboardingStart>(
        scopedPath("/api/messaging/telegram/onboarding/start", agent.hermesProfileName),
        {
          method: "POST",
          body: JSON.stringify({ bot_name: activeBotName(agent.name) }),
          signal: AbortSignal.timeout(15_000),
        },
        { agentId: agent.id, profile: agent.hermesProfileName },
      );
      return NextResponse.json(result);
    }

    if (body?.action === "telegram_onboarding_status") {
      const pairingId = normalizedPairingId(body.pairingId);
      if (!pairingId) {
        return NextResponse.json({ error: "Session Telegram invalide." }, { status: 400 });
      }
      const result = await hermesFetch<TelegramOnboardingStatus>(
        scopedPath(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`, agent.hermesProfileName),
        { signal: AbortSignal.timeout(15_000) },
        { agentId: agent.id, profile: agent.hermesProfileName },
      );
      return NextResponse.json(result);
    }

    if (body?.action === "telegram_onboarding_apply") {
      const pairingId = normalizedPairingId(body.pairingId);
      if (!pairingId) {
        return NextResponse.json({ error: "Session Telegram invalide." }, { status: 400 });
      }
      const allowedUserIds = Array.isArray(body.allowedUserIds)
        ? body.allowedUserIds.filter(
          (value): value is string => typeof value === "string" && /^\d+$/.test(value),
        )
        : [];
      if (allowedUserIds.length === 0) {
        return NextResponse.json(
          { error: "Hermes n’a pas pu identifier ton compte Telegram." },
          { status: 400 },
        );
      }
      const result = await hermesFetch<Record<string, unknown>>(
        scopedPath(
          `/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}/apply`,
          agent.hermesProfileName,
        ),
        {
          method: "POST",
          body: JSON.stringify({
            profile: agent.hermesProfileName,
            allowed_user_ids: [...new Set(allowedUserIds)],
          }),
          signal: AbortSignal.timeout(15_000),
        },
        { agentId: agent.id, profile: agent.hermesProfileName },
      );
      await ensureHermesConsoleControlExtension(agent.id, agent.hermesProfileName);
      let restartWarning: string | null = null;
      try {
        await runLocalHermesGatewayCommand(agent.id, agent.hermesProfileName, "restart");
      } catch (error) {
        restartWarning = error instanceof Error ? error.message : "Redémarrage du gateway impossible.";
      }
      return NextResponse.json({ ...result, restartWarning });
    }

    if (body?.action === "telegram_onboarding_cancel") {
      const pairingId = normalizedPairingId(body.pairingId);
      if (!pairingId) {
        return NextResponse.json({ error: "Session Telegram invalide." }, { status: 400 });
      }
      const result = await hermesFetch<Record<string, unknown>>(
        scopedPath(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`, agent.hermesProfileName),
        { method: "DELETE" },
        { agentId: agent.id, profile: agent.hermesProfileName },
      );
      return NextResponse.json(result);
    }

    if (body?.action === "start" || body?.action === "restart") {
      const current = await loadPlatforms(agent.id, agent.hermesProfileName);
      const telegram = current.platforms.find((platform) => platform.id === "telegram");
      if (telegram?.enabled && telegram.configured) {
        await ensureHermesConsoleControlExtension(agent.id, agent.hermesProfileName);
      }
      const result = await runLocalHermesGatewayCommand(agent.id, agent.hermesProfileName, body.action);
      await recordMessagingEvent({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        userId: user.id,
        agentId: agent.id,
        action: body.action === "start" ? "messaging.gateway_started" : "messaging.gateway_restarted",
        metadata: { lifecycleAction: body.action },
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Action gateway invalide." }, { status: 400 });
  } catch (error) {
    await recordMessagingEvent({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      userId: user.id,
      agentId: agent.id,
      action: "messaging.action_failed",
      metadata: {
        platform: isSupportedPlatform(body?.platform) ? body.platform : undefined,
        state: typeof body?.action === "string" ? body.action : "unknown_action",
        error: safeErrorMessage(error),
      },
    });
    return runtimeErrorResponse(error);
  }
}
