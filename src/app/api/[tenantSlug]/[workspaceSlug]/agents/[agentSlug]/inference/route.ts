import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { ALL_REASONING_CONTROL_IDS } from "@/components/shared/chat/constants/reasoning-config";

type HermesEnvRow = {
  is_set?: boolean;
  is_password?: boolean;
  provider?: string;
  provider_label?: string;
  description?: string;
  url?: string | null;
};

type HermesModelInfo = {
  provider?: string;
  model?: string;
};

type HermesConfig = {
  agent?: { reasoning_effort?: unknown };
};

type HermesModelProvider = {
  slug?: string;
  name?: string;
  models?: unknown[];
  authenticated?: boolean;
  capabilities?: Record<string, { fast?: boolean; reasoning?: boolean }>;
  warning?: string;
  source?: string;
};

type HermesModelOptions = {
  providers?: HermesModelProvider[];
};

type HermesOAuthProvider = {
  id?: string;
  name?: string;
  flow?: "pkce" | "device_code" | "external";
  docs_url?: string;
  status?: { logged_in?: boolean };
};

type HermesOAuthOptions = {
  providers?: HermesOAuthProvider[];
};

type HermesModelSetResult = {
  ok?: boolean;
  confirm_required?: boolean;
  confirm_message?: string;
};

type HermesValidationResult = {
  ok?: boolean;
  reachable?: boolean;
  message?: string;
};

type RuntimeState = {
  env: Record<string, HermesEnvRow>;
  info: HermesModelInfo;
  options: HermesModelOptions;
  oauth: HermesOAuthOptions;
  config: HermesConfig;
};

const REASONING_EFFORTS = new Set<string>(ALL_REASONING_CONTROL_IDS);

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

function runtimeErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Runtime Hermes indisponible.";
  const status = error instanceof HermesRuntimeError && error.status
    ? Math.min(Math.max(error.status, 400), 599)
    : 503;
  return NextResponse.json({ error: message }, { status });
}

function modelNames(provider: HermesModelProvider) {
  return (provider.models ?? [])
    .map((model) => {
      if (typeof model === "string") return model;
      if (model && typeof model === "object" && "id" in model) {
        const id = (model as { id?: unknown }).id;
        return typeof id === "string" ? id : "";
      }
      return "";
    })
    .filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
}

function canonicalModelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function catalogModelName(provider: HermesModelProvider | undefined, currentModel: string) {
  if (!provider || !currentModel) return currentModel;
  const canonicalCurrent = canonicalModelName(currentModel);
  return modelNames(provider).find((model) => canonicalModelName(model) === canonicalCurrent) ?? currentModel;
}

function credentialForProvider(env: Record<string, HermesEnvRow>, provider: string) {
  const rows = Object.entries(env).filter(([, row]) => (
    row.provider === provider && row.is_password === true
  ));
  return rows.find(([, row]) => row.is_set === true) ?? rows[0] ?? null;
}

function resolvedCurrentProvider(info: HermesModelInfo, providers: HermesModelProvider[]) {
  const explicit = (info.provider ?? "").trim();
  if (explicit && explicit !== "auto") return explicit;
  const rawModel = (info.model ?? "").trim();
  const prefix = rawModel.includes("/") ? rawModel.split("/", 1)[0] : "";
  if (prefix && providers.some((provider) => provider.slug === prefix)) return prefix;
  const bareModel = rawModel.includes("/") ? rawModel.slice(rawModel.indexOf("/") + 1) : rawModel;
  return providers.find((provider) => modelNames(provider).includes(bareModel))?.slug ?? explicit;
}

function clientState(
  agent: { id: string; name: string; slug: string },
  canEdit: boolean,
  runtime: RuntimeState,
) {
  const oauthById = new Map(
    (runtime.oauth.providers ?? [])
      .filter((provider): provider is HermesOAuthProvider & { id: string } => Boolean(provider.id))
      .map((provider) => [provider.id, provider]),
  );
  const rawProviders = (runtime.options.providers ?? []).filter(
    (provider): provider is HermesModelProvider & { slug: string } => Boolean(provider.slug),
  );
  const currentProvider = resolvedCurrentProvider(runtime.info, rawProviders);
  const rawCurrentModel = runtime.info.model ?? "";
  const bareCurrentModel = currentProvider && rawCurrentModel.startsWith(`${currentProvider}/`)
    ? rawCurrentModel.slice(currentProvider.length + 1)
    : rawCurrentModel;
  const currentModel = catalogModelName(
    rawProviders.find((provider) => provider.slug === currentProvider),
    bareCurrentModel,
  );

  const providers = rawProviders.map((provider) => {
    const credential = credentialForProvider(runtime.env, provider.slug);
    const oauth = oauthById.get(provider.slug);
    const authenticated = provider.authenticated === true || oauth?.status?.logged_in === true;
    const setupMode = credential
      ? "credential"
      : oauth?.flow === "external"
        ? "external"
        : oauth
          ? "oauth"
          : authenticated
            ? "none"
            : "advanced";
    return {
      id: provider.slug,
      name: provider.name || provider.slug,
      models: modelNames(provider),
      authenticated,
      setupMode,
      credentialConfigured: credential?.[1].is_set === true,
      credentialUrl: credential?.[1].url || null,
      oauthFlow: oauth?.flow || null,
      oauthLoggedIn: oauth?.status?.logged_in === true,
      docsUrl: oauth?.docs_url || credential?.[1].url || null,
      capabilities: provider.capabilities ?? {},
    };
  });

  return {
    agent: { id: agent.id, name: agent.name, slug: agent.slug },
    canEdit,
    currentProvider,
    currentModel,
    currentReasoningEffort: REASONING_EFFORTS.has(String(runtime.config.agent?.reasoning_effort))
      ? String(runtime.config.agent?.reasoning_effort)
      : "high",
    providers,
  };
}

async function loadRuntimeState(profile: string, refresh = false): Promise<RuntimeState> {
  const encodedProfile = encodeURIComponent(profile);
  const refreshQuery = refresh ? "&refresh=1" : "";
  const [env, info, options, oauth, config] = await Promise.all([
    hermesFetch<Record<string, HermesEnvRow>>(`/api/env?profile=${encodedProfile}`),
    hermesFetch<HermesModelInfo>(`/api/model/info?profile=${encodedProfile}`),
    hermesFetch<HermesModelOptions>(
      `/api/model/options?profile=${encodedProfile}&include_unconfigured=1${refreshQuery}`,
      { signal: AbortSignal.timeout(refresh ? 30_000 : 15_000) },
    ),
    hermesFetch<HermesOAuthOptions>(`/api/providers/oauth?profile=${encodedProfile}`)
      .catch((): HermesOAuthOptions => ({ providers: [] })),
    hermesFetch<HermesConfig>(`/api/config?profile=${encodedProfile}`),
  ]);
  return { env, info, options, oauth, config };
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
    const runtime = await loadRuntimeState(agent.hermesProfileName);
    return NextResponse.json(clientState(agent, canConfigureRuntime(access.role), runtime));
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
    return NextResponse.json({ error: "Seul un Owner peut configurer l’inférence." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    mode?: unknown;
    provider?: unknown;
    credential?: unknown;
    model?: unknown;
    reasoningEffort?: unknown;
    confirmExpensiveModel?: unknown;
  } | null;
  const mode = body?.mode === "credential"
    ? "credential"
    : body?.mode === "reasoning"
      ? "reasoning"
      : "model";
  const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
  const credential = typeof body?.credential === "string" ? body.credential.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const reasoningEffort = typeof body?.reasoningEffort === "string"
    ? body.reasoningEffort.trim().toLowerCase()
    : "";
  const confirmExpensiveModel = body?.confirmExpensiveModel === true;
  if (mode !== "reasoning" && (!provider || provider.length > 100)) {
    return NextResponse.json({ error: "Fournisseur invalide." }, { status: 400 });
  }
  if (credential.length > 20_000) {
    return NextResponse.json({ error: "Identifiant fournisseur invalide." }, { status: 400 });
  }

  try {
    const runtime = await loadRuntimeState(agent.hermesProfileName);
    if (mode === "reasoning") {
      if (!REASONING_EFFORTS.has(reasoningEffort)) {
        return NextResponse.json({ error: "Effort de raisonnement invalide." }, { status: 400 });
      }
      await hermesFetch<{ ok?: boolean }>(`/api/config?profile=${encodeURIComponent(agent.hermesProfileName)}`, {
        method: "PUT",
        body: JSON.stringify({
          profile: agent.hermesProfileName,
          config: { agent: { reasoning_effort: reasoningEffort } },
        }),
      });
      await db.insert(auditEvents).values({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        actorUserId: user.id,
        action: "agent.inference.reasoning_updated",
        targetType: "agent",
        targetId: agent.id,
        metadata: { reasoningEffort },
      });
      return NextResponse.json({ ok: true, reasoningEffort });
    }
    const providerRow = runtime.options.providers?.find((item) => item.slug === provider);
    if (!providerRow) {
      return NextResponse.json({ error: "Ce fournisseur n’est pas proposé par Hermes." }, { status: 400 });
    }

    if (mode === "credential") {
      const credentialRow = credentialForProvider(runtime.env, provider);
      if (!credentialRow) {
        return NextResponse.json({ error: "Ce fournisseur n’accepte pas d’identifiant direct." }, { status: 400 });
      }
      if (!credential) {
        return NextResponse.json({ error: "Ajoutez l’identifiant demandé par ce fournisseur." }, { status: 400 });
      }
      const [credentialKey] = credentialRow;
      const validation = await hermesFetch<HermesValidationResult>(
        "/api/providers/validate",
        {
          method: "POST",
          body: JSON.stringify({ key: credentialKey, value: credential, profile: agent.hermesProfileName }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (validation.ok !== true && validation.reachable === true) {
        return NextResponse.json(
          { error: validation.message || "Cet identifiant a été refusé par le fournisseur." },
          { status: 422 },
        );
      }
      await hermesFetch<{ ok?: boolean }>("/api/env", {
        method: "PUT",
        body: JSON.stringify({
          key: credentialKey,
          value: credential,
          profile: agent.hermesProfileName,
        }),
      });
      const refreshed = await loadRuntimeState(agent.hermesProfileName, true);
      await db.insert(auditEvents).values({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        actorUserId: user.id,
        action: "agent.inference.credential_updated",
        targetType: "agent",
        targetId: agent.id,
        metadata: { provider },
      });
      return NextResponse.json({
        ok: true,
        state: clientState(agent, true, refreshed),
        warning: validation.reachable === false
          ? validation.message || "Identifiant enregistré sans validation automatique."
          : null,
      });
    }

    if (!model || model.length > 200 || !modelNames(providerRow).includes(model)) {
      return NextResponse.json({ error: "Ce modèle n’est pas proposé par le fournisseur sélectionné." }, { status: 400 });
    }
    const assignment = await hermesFetch<HermesModelSetResult>("/api/model/set", {
      method: "POST",
      body: JSON.stringify({
        scope: "main",
        provider,
        model,
        profile: agent.hermesProfileName,
        confirm_expensive_model: confirmExpensiveModel,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (assignment.confirm_required) {
      return NextResponse.json(
        {
          error: assignment.confirm_message || "Ce modèle nécessite une confirmation de coût.",
          confirmRequired: true,
        },
        { status: 409 },
      );
    }
    if (assignment.ok === false) {
      return NextResponse.json(
        { error: assignment.confirm_message || "Hermes a refusé ce modèle." },
        { status: 422 },
      );
    }

    if (reasoningEffort) {
      if (!REASONING_EFFORTS.has(reasoningEffort)) {
        return NextResponse.json({ error: "Effort de raisonnement invalide." }, { status: 400 });
      }
      await hermesFetch<{ ok?: boolean }>(`/api/config?profile=${encodeURIComponent(agent.hermesProfileName)}`, {
        method: "PUT",
        body: JSON.stringify({
          profile: agent.hermesProfileName,
          config: { agent: { reasoning_effort: reasoningEffort } },
        }),
      });
    }

    await db
      .update(agents)
      .set({ runtimeState: "ready", runtimeError: null, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));
    await db.insert(auditEvents).values({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      actorUserId: user.id,
      action: "agent.inference.updated",
      targetType: "agent",
      targetId: agent.id,
      metadata: { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) },
    });

    return NextResponse.json({ ok: true, provider, model, reasoningEffort: reasoningEffort || undefined });
  } catch (error) {
    return runtimeErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const { user, access, agent } = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut retirer un identifiant d’inférence." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { provider?: unknown } | null;
  const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
  if (!provider) return NextResponse.json({ error: "Fournisseur invalide." }, { status: 400 });

  try {
    const runtime = await loadRuntimeState(agent.hermesProfileName);
    const credentialRow = credentialForProvider(runtime.env, provider);
    if (!credentialRow || credentialRow[1].is_set !== true) {
      return NextResponse.json({ ok: true, state: clientState(agent, true, runtime) });
    }
    await hermesFetch<{ ok?: boolean }>("/api/env", {
      method: "DELETE",
      body: JSON.stringify({ key: credentialRow[0], profile: agent.hermesProfileName }),
    });
    const currentProvider = resolvedCurrentProvider(
      runtime.info,
      runtime.options.providers ?? [],
    );
    if (currentProvider === provider) {
      await db
        .update(agents)
        .set({
          runtimeState: "setup_required",
          runtimeError: "Identifiant du fournisseur retiré.",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id));
    }
    await db.insert(auditEvents).values({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      actorUserId: user.id,
      action: "agent.inference.credential_removed",
      targetType: "agent",
      targetId: agent.id,
      metadata: { provider },
    });
    const refreshed = await loadRuntimeState(agent.hermesProfileName, true);
    return NextResponse.json({ ok: true, state: clientState(agent, true, refreshed) });
  } catch (error) {
    if (error instanceof HermesRuntimeError && error.status === 404) {
      return NextResponse.json({ ok: true });
    }
    return runtimeErrorResponse(error);
  }
}
