import type { Page, WebSocketRoute } from "@playwright/test";

export type RpcCall = {
  id: number;
  method: string;
  params: Record<string, unknown>;
};

const sessionInfo = {
  model: "gpt-5.5",
  provider: "openai-codex",
  reasoning_effort: "high",
  fast: false,
  yolo: false,
  approval_mode: "smart",
  cwd: "/workspace/hermes-console",
  running: false,
  profile_name: "default",
  usage: { context_used: 12_500, context_max: 128_000, context_percent: 9.8 },
};

type MockSessionInfo = Omit<typeof sessionInfo, "usage"> & {
  usage: Partial<(typeof sessionInfo)["usage"]>;
};

function resultFor(call: RpcCall, activeSessionInfo: MockSessionInfo = sessionInfo) {
  switch (call.method) {
    case "model.options":
      return {
        provider: "openai-codex",
        model: "gpt-5.5",
        providers: [
          {
            slug: "anthropic",
            authenticated: true,
            models: ["claude-opus-4-6", "claude-haiku-4-5"],
            capabilities: {
              "claude-opus-4-6": { fast: true, reasoning: true },
              "claude-haiku-4-5": { fast: false, reasoning: true },
            },
          },
        ],
      };
    case "tools.list":
      return { toolsets: [{ name: "web", enabled: true, tools: ["web_search"] }] };
    case "session.create":
      return {
        session_id: "live-e2e",
        stored_session_id: "session-e2e",
        messages: [],
        running: false,
        info: activeSessionInfo,
      };
    case "session.resume":
      return {
        session_id: "live-e2e",
        stored_session_id: String(call.params.session_id),
        messages: [],
        running: false,
        info: activeSessionInfo,
      };
    case "session.info":
      return activeSessionInfo;
    case "complete.path":
      return {
        items: [
          { value: "@file:src/app/page.tsx", description: "Source file" },
          { value: "@folder:src/components", description: "Components folder" },
        ],
      };
    case "complete.slash":
      return {
        items: [
          { command: "/plan", description: "Create an implementation plan" },
          { command: "/help", description: "List Hermes commands" },
        ],
      };
    case "command.dispatch":
      return { type: "send", message: `[native-plan] ${String(call.params.arg ?? "")}` };
    case "slash.exec":
      return { type: "send", message: `[slash] ${String(call.params.command ?? "")}` };
    case "file.attach":
      return { ref_text: `@file:${String(call.params.name ?? "attachment")}` };
    default:
      return { ok: true };
  }
}

const toolsHistoryMessages = [
  { role: "user", text: "historique outils", timestamp: 1 },
  {
    role: "tool",
    name: "skill_view",
    result: JSON.stringify({
      success: true,
      name: "automate",
      description: "Create Cursor Automations.",
      content: "## Automate\n\nSkill content for automate.",
    }),
    timestamp: 2,
  },
  {
    role: "tool",
    name: "skill_view",
    result: JSON.stringify({
      success: true,
      name: "canvas",
      description: "Live React canvas beside chat.",
      content: "## Canvas\n\nSkill content for canvas.",
    }),
    timestamp: 3,
  },
  { role: "tool", name: "terminal", result: "exit 0", timestamp: 4 },
  { role: "assistant", text: "Réponse historique.", timestamp: 5 },
];

function sessionIdFromUrl(url: string) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const sessionsIndex = parts.lastIndexOf("sessions");
  if (sessionsIndex < 0 || sessionsIndex >= parts.length - 1) return null;
  return decodeURIComponent(parts[sessionsIndex + 1]!);
}

function event(ws: WebSocketRoute, type: string, payload: Record<string, unknown> = {}) {
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    method: "event",
    params: { type, session_id: "live-e2e", payload },
  }));
}

export async function installHermesMock(
  page: Page,
  options: {
    liveContext?: boolean;
    persistedContext?: boolean;
    sessionsDelayMs?: number;
    historyDelayMs?: number;
    gatewayUrl?: string;
  } = {},
) {
  const calls: RpcCall[] = [];
  const activeSessionInfo = options.liveContext === false
    ? { ...sessionInfo, usage: {} }
    : sessionInfo;
  let sessionRows = [
    {
      id: "history-e2e",
      title: "Session à supprimer",
      startedAt: "2026-07-14T12:00:00.000Z",
      lastActiveAt: "2026-07-14T12:00:00.000Z",
      messageCount: 2,
      archived: false,
    },
    {
      id: "tools-history-e2e",
      title: "Session avec outils",
      startedAt: "2026-07-14T12:30:00.000Z",
      lastActiveAt: "2026-07-14T12:30:00.000Z",
      messageCount: 5,
      archived: false,
    },
  ];

  await page.route("**/runtime-ticket", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ticket: "e2e-ticket", gatewayUrl: options.gatewayUrl ?? "ws://127.0.0.1:8787/v1/ws" }),
  }));
  await page.route("**/agents/*/inference", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          currentProvider: "anthropic",
          currentModel: "claude-haiku-4-5",
          currentReasoningEffort: "medium",
          providers: [
            {
              id: "anthropic",
              authenticated: true,
              models: [
                "claude-opus-4-6",
                "claude-haiku-4-5",
                "claude-haiku-4-5-no-thinking",
              ],
              capabilities: {
                "claude-opus-4-6": { fast: true, reasoning: true },
                "claude-haiku-4-5": { fast: false, reasoning: true },
                "claude-haiku-4-5-no-thinking": { fast: false, reasoning: false },
              },
            },
            {
              id: "openai-codex",
              authenticated: true,
              models: ["gpt-5.5", "gpt-5.3-codex"],
              capabilities: {
                "gpt-5.5": { fast: true, reasoning: true },
                "gpt-5.3-codex": { fast: false, reasoning: true },
              },
            },
          ],
        }),
      });
      return;
    }
    calls.push({
      id: -1,
      method: "inference.update",
      params: route.request().postDataJSON() as Record<string, unknown>,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/agents/*/sessions**", async (route) => {
    const method = route.request().method();
    const sessionId = sessionIdFromUrl(route.request().url());
    if (method === "GET" && route.request().url().endsWith("/metrics")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId,
          source: "telegram",
          model: "gpt-5.6-luna",
          provider: "openai-codex",
          reasoningEffort: "low",
          usage: {
            processedTokens: 420_194,
            inputTokens: 121_446,
            cacheReadTokens: 296_448,
            cacheWriteTokens: 0,
            outputTokens: 2_300,
            reasoningTokens: 351,
            apiCalls: 12,
          },
          context: options.persistedContext === false
            ? null
            : {
                usedTokens: 70_587,
                maxTokens: 272_000,
                remainingTokens: 201_413,
                percent: 25.951,
                measuredAt: "2026-07-15T01:01:23.337Z",
              },
        }),
      });
      return;
    }
    if (method === "GET" && sessionId) {
      if (options.historyDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.historyDelayMs));
      }
      const messages = sessionId === "tools-history-e2e" ? toolsHistoryMessages : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ messages }),
      });
      return;
    }
    if (method === "GET") {
      if (options.sessionsDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.sessionsDelayMs));
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: sessionRows }) });
      return;
    }
    if (method === "DELETE") {
      const sessionId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
      sessionRows = sessionRows.filter((session) => session.id !== sessionId);
      calls.push({ id: -2, method: "sessions.delete", params: { session_id: sessionId } });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.routeWebSocket(/^(?:ws:\/\/127\.0\.0\.1:8787|wss:\/\/relay\.example\.test)(?:\/|\?)/, (ws) => {
    let handoffState = "";
    let handoffPolls = 0;
    setTimeout(() => {
      ws.send(JSON.stringify({ __bridge__: "status", online: true, pid: 4321 }));
    }, 50);
    ws.onMessage((raw) => {
      const call = JSON.parse(String(raw)) as RpcCall;
      calls.push(call);
      if (
        call.method === "session.resume"
        && !sessionRows.some((session) => session.id === String(call.params.session_id))
      ) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: call.id, error: { code: 4007, message: "session not found" } }));
        return;
      }
      let result: Record<string, unknown>;
      if (call.method === "handoff.request") {
        handoffState = "pending";
        handoffPolls = 0;
        result = {
          queued: true,
          session_key: "session-e2e",
          platform: "telegram",
          home_name: "E2E home",
        };
      } else if (call.method === "handoff.state") {
        handoffPolls += 1;
        handoffState = handoffPolls === 1 ? "running" : "completed";
        result = { state: handoffState, platform: "telegram", error: "" };
      } else if (call.method === "handoff.fail") {
        if (handoffState !== "completed") handoffState = "failed";
        result = { failed: handoffState === "failed", state: handoffState };
      } else {
        result = resultFor(call, activeSessionInfo);
      }
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
      if (call.method === "prompt.submit") {
        const text = String(call.params.text ?? "");
        const submitCount = calls.filter((item) => item.method === "prompt.submit").length;
        if (text.includes("slow response")) {
          event(ws, "message.start");
          return;
        }
        if (text.includes("reasoning stream")) {
          event(ws, "reasoning.delta", { text: "Je réfléchis" });
          event(ws, "reasoning.delta", { text: " à la réponse." });
          event(ws, "message.start");
          event(ws, "message.delta", { text: "Réponse " });
          event(ws, "message.complete", { text: "Réponse Hermes simulée." });
          return;
        }
        event(ws, "message.start");
        if (text.includes("refresh test") && submitCount > 1) {
          event(ws, "message.complete", { text: "Réponse Hermes régénérée." });
          return;
        }
        if (text.includes("edited prompt")) {
          event(ws, "message.complete", { text: "Réponse Hermes éditée." });
          return;
        }
        event(ws, "message.delta", { text: "Réponse " });
        event(ws, "message.complete", { text: "Réponse Hermes simulée." });
      }
    });
  });

  return calls;
}

export async function loginE2E(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: "e2e@hermes.local", password: "e2e-password" },
  });
  if (!response.ok()) throw new Error(`E2E login failed: ${response.status()}`);
}
