import { describe, expect, test } from "bun:test";
import type { AgentContextParams, AgentRuntimeContext } from "../domain/agent-context";
import type {
  MessagingPlatform,
  MessagingRuntimePort,
  MessagingState,
  TelegramReachability,
} from "./messaging-ports";
import { createMessagingUseCases } from "./messaging-use-cases";

const PARAMS: AgentContextParams = { tenantSlug: "acme", agentSlug: "ada" };
const CONTEXT: AgentRuntimeContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  role: "owner",
  agent: { id: "agent-1", name: "Ada", slug: "ada", hermesProfileName: "ada" },
};
const TOKEN = "123456789:AAH-bot-token-that-must-never-leak";
const CHAT_ID = "424242";

function telegramPlatform(overrides: Partial<MessagingPlatform> = {}): MessagingPlatform {
  return { id: "telegram", enabled: true, configured: true, gateway_running: true, state: "connected", ...overrides };
}

function createFakes(options: {
  platforms: MessagingPlatform[];
  waitState?: string | null;
  /** `updated_at` renvoyé par `waitForState` : identique au marqueur = état d'avant-commande. */
  waitUpdatedAt?: string | null;
  probe?: TelegramReachability[];
}) {
  const events: { action: string; metadata: Record<string, unknown> }[] = [];
  const probes: { token: string; chatIds: string[] }[] = [];
  const waits: { platform: string; since: string | null }[] = [];
  const state: MessagingState = { gatewayStartCommand: "hermes -p ada gateway start", platforms: options.platforms };
  const runtime: MessagingRuntimePort = {
    async load() {
      return state;
    },
    async waitForState(_agentId, _profile, platform, since) {
      waits.push({ platform, since: since ?? null });
      return {
        id: platform,
        enabled: true,
        configured: true,
        gateway_running: true,
        state: options.waitState ?? null,
        updated_at: options.waitUpdatedAt ?? null,
      };
    },
    async ensureControlExtension() {},
    async configure() {},
    async lifecycle(_agentId, _profile, action) {
      return { ok: true, message: `Gateway ${action} demandé via l’Edge.` };
    },
    async reconcileTelegramLock() {
      return { status: "none" };
    },
    async deleteCredential() {},
    async test() {
      return {};
    },
    async telegramStart() {
      return {};
    },
    async telegramStatus() {
      return {};
    },
    async telegramApply() {
      return {};
    },
    async telegramCancel() {
      return {};
    },
    async probeTelegramReachability(token, chatIds) {
      probes.push({ token, chatIds });
      return options.probe ?? chatIds.map((chatId) => ({ chatId, status: "reachable" as const }));
    },
    classifyError(error) {
      const message = error instanceof Error ? error.message : "Runtime Hermes indisponible.";
      return { message, status: 503, safeMessage: message };
    },
  };
  const useCases = createMessagingUseCases({
    contexts: { async resolve() { return CONTEXT; } },
    runtime,
    audit: {
      async record(input) {
        events.push({ action: input.action, metadata: input.metadata });
      },
    },
  });
  return { useCases, events, probes, waits };
}

function configureBody() {
  return { platform: "telegram", enabled: true, token: TOKEN, allowedUsers: CHAT_ID };
}

describe("action start/restart", () => {
  test("ne déclare pas de succès quand le gateway ne revient pas connecté", async () => {
    const fakes = createFakes({ platforms: [telegramPlatform()], waitState: "startup_failed" });
    const response = await fakes.useCases.action(PARAMS, { action: "restart" });
    const body = response.body as { ok?: boolean; state?: string | null };
    expect(body.ok).not.toBe(true);
    expect(body.state).toBe("startup_failed");
    expect(fakes.events.at(-1)?.action).toBe("messaging.gateway_restarted");
    expect(fakes.events.at(-1)?.metadata.runtimeState).toBe("startup_failed");
  });

  test("déclare le succès quand l'état observé est connected", async () => {
    const fakes = createFakes({ platforms: [telegramPlatform()], waitState: "connected" });
    const response = await fakes.useCases.action(PARAMS, { action: "restart" });
    expect((response.body as { ok?: boolean }).ok).toBe(true);
  });

  test("exige une transition : passe le marqueur d'avant-commande à waitForState", async () => {
    const marker = "2026-07-26T10:00:00.000Z";
    const fakes = createFakes({
      platforms: [telegramPlatform({ updated_at: marker })],
      waitState: "connected",
    });
    await fakes.useCases.action(PARAMS, { action: "restart" });
    // Sans ce marqueur, l'ancien process encore vivant renverrait son `connected`
    // d'avant le redémarrage et on conclurait au succès sans rien avoir observé.
    expect(fakes.waits).toEqual([{ platform: "telegram", since: marker }]);
  });

  test("état `connected` périmé (marqueur inchangé) : pas de succès", async () => {
    const marker = "2026-07-26T10:00:00.000Z";
    const fakes = createFakes({
      platforms: [telegramPlatform({ updated_at: marker })],
      waitState: "connected",
      waitUpdatedAt: marker,
    });
    const response = await fakes.useCases.action(PARAMS, { action: "restart" });
    const body = response.body as { ok?: boolean; state?: string | null; message?: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain("non confirmé");
    expect(fakes.events.at(-1)?.metadata.stateConfirmed).toBe(false);
  });

  test("horodatage absent alors qu'un marqueur existe : pas de succès", async () => {
    const fakes = createFakes({
      platforms: [telegramPlatform({ updated_at: "2026-07-26T10:00:00.000Z" })],
      waitState: "connected",
      waitUpdatedAt: null,
    });
    const response = await fakes.useCases.action(PARAMS, { action: "restart" });
    // Un `updated_at` manquant ne prouve aucune réécriture : le confirmer reviendrait
    // à réintroduire exactement le faux positif que le marqueur doit empêcher.
    expect((response.body as { ok?: boolean }).ok).toBe(false);
    expect(fakes.events.at(-1)?.metadata.stateConfirmed).toBe(false);
  });

  test("état `connected` réécrit après la commande : succès confirmé", async () => {
    const fakes = createFakes({
      platforms: [telegramPlatform({ updated_at: "2026-07-26T10:00:00.000Z" })],
      waitState: "connected",
      waitUpdatedAt: "2026-07-26T10:00:31.000Z",
    });
    const response = await fakes.useCases.action(PARAMS, { action: "restart" });
    expect((response.body as { ok?: boolean }).ok).toBe(true);
    expect(fakes.events.at(-1)?.metadata.stateConfirmed).toBe(true);
  });
});

describe("configure telegram reachability", () => {
  test("échoue quand le bot ne peut pas écrire au compte autorisé", async () => {
    const fakes = createFakes({
      platforms: [telegramPlatform()],
      waitState: "connected",
      probe: [{ chatId: CHAT_ID, status: "unreachable", reason: "chat_not_found" }],
    });
    const response = await fakes.useCases.configure(PARAMS, configureBody());
    const body = response.body as { ok?: boolean; state?: string | null; message?: string; reachabilityChecked?: boolean };
    expect(body.ok).toBe(false);
    expect(body.state).toBe("unreachable");
    expect(body.message).toContain("/start");
    expect(body.reachabilityChecked).toBe(true);
    expect(fakes.probes).toEqual([{ token: TOKEN, chatIds: [CHAT_ID] }]);
    expect(fakes.events.map((event) => event.action)).toContain("messaging.unreachable");
  });

  test("token changé sans allowedUsers : ne prétend pas avoir vérifié", async () => {
    const fakes = createFakes({ platforms: [telegramPlatform()], waitState: "connected" });
    const response = await fakes.useCases.configure(PARAMS, { platform: "telegram", enabled: true, token: TOKEN });
    const body = response.body as { ok?: boolean; state?: string | null; reachabilityChecked?: boolean };
    expect(fakes.probes).toHaveLength(0);
    expect(body.reachabilityChecked).toBe(false);
    expect(fakes.events.at(-1)?.metadata.reachabilityChecked).toBe(false);
    // L'angle mort est rendu visible sans casser le flux nominal.
    expect(body.ok).toBe(true);
    expect(body.state).toBe("connected");
  });

  test("état `connected` périmé : configure ne conclut pas à la connexion", async () => {
    const marker = "2026-07-26T10:00:00.000Z";
    const fakes = createFakes({
      platforms: [telegramPlatform({ updated_at: marker })],
      waitState: "connected",
      waitUpdatedAt: marker,
    });
    const response = await fakes.useCases.configure(PARAMS, configureBody());
    const body = response.body as { ok?: boolean; state?: string | null };
    expect(body.ok).toBe(false);
    expect(fakes.events.at(-1)?.action).toBe("messaging.pending");
    expect(fakes.events.at(-1)?.metadata.stateConfirmed).toBe(false);
  });

  test("sonde indéterminée : conserve l'état pending existant", async () => {
    const fakes = createFakes({
      platforms: [telegramPlatform({ state: "pending_restart" })],
      waitState: "pending_restart",
      probe: [{ chatId: CHAT_ID, status: "unknown", reason: "probe_unavailable" }],
    });
    const response = await fakes.useCases.configure(PARAMS, configureBody());
    const body = response.body as { ok?: boolean; state?: string | null; reachabilityChecked?: boolean };
    expect(fakes.probes).toHaveLength(1);
    expect(body.state).toBe("pending_restart");
    expect(body.reachabilityChecked).toBe(false);
    expect(fakes.events.map((event) => event.action)).not.toContain("messaging.unreachable");
    expect(fakes.events.at(-1)?.action).toBe("messaging.pending");
  });

  test("sonde indéterminée : pas de faux négatif sur un channel connecté", async () => {
    const fakes = createFakes({
      platforms: [telegramPlatform()],
      waitState: "connected",
      probe: [{ chatId: CHAT_ID, status: "unknown", reason: "probe_unavailable" }],
    });
    const response = await fakes.useCases.configure(PARAMS, configureBody());
    const body = response.body as { ok?: boolean; state?: string | null; reachabilityChecked?: boolean };
    expect(fakes.probes).toHaveLength(1);
    expect(body.ok).toBe(true);
    expect(body.state).toBe("connected");
    expect(body.reachabilityChecked).toBe(false);
  });

  test("ne divulgue jamais le token du bot", async () => {
    const fakes = createFakes({
      platforms: [telegramPlatform()],
      waitState: "connected",
      probe: [{ chatId: CHAT_ID, status: "unreachable", reason: "chat_not_found" }],
    });
    const response = await fakes.useCases.configure(PARAMS, configureBody());
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
    expect(JSON.stringify(fakes.events)).not.toContain(TOKEN);
  });
});
