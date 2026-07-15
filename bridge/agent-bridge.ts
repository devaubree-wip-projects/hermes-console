/**
 * Local Hermes runtime broker.
 *
 * The browser never receives the Hermes dashboard token and cannot choose a
 * profile. Next.js mints a short-lived HMAC ticket; this broker validates it,
 * opens one isolated upstream /api/ws connection, and forces the authorised
 * profile into profile-aware JSON-RPC calls.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SessionChangeHub, type SessionSnapshot } from "./session-change-hub";

const HOST = process.env.HERMES_BRIDGE_HOST ?? "127.0.0.1";
const PORT = Number(process.env.HERMES_BRIDGE_PORT ?? 8787);
const RUNTIME_HTTP = (process.env.HERMES_RUNTIME_URL ?? "http://127.0.0.1:9119").replace(/\/$/, "");
const RUNTIME_WS = process.env.HERMES_RUNTIME_WS ?? "ws://127.0.0.1:9119/api/ws";
const RUNTIME_TOKEN =
  process.env.HERMES_DASHBOARD_SESSION_TOKEN ||
  process.env.HERMES_RUNTIME_TOKEN ||
  "hermes-console-local-runtime";
const HERMES_COMMAND = process.env.HERMES_CLI_COMMAND || "hermes";
const RUNTIME_AUTOSTART = process.env.HERMES_RUNTIME_AUTOSTART !== "false";
const BRIDGE_SECRET = process.env.HERMES_BRIDGE_SECRET ?? "hermes-console-local-development";
const ALLOWED_ORIGINS = new Set(
  (process.env.HERMES_ALLOWED_ORIGINS ?? "http://127.0.0.1:3010,http://localhost:3010")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

type TicketPayload = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  profile: string;
  role: "owner" | "member" | "viewer";
  exp: number;
};

type ClientData = {
  ticket: TicketPayload;
  upstream: WebSocket | null;
  queue: string[];
  sessionSubscriptions: Map<string, () => void>;
};

let ownedRuntime: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null;
let runtimeBoot: Promise<void> | null = null;
let shuttingDown = false;

function runtimeTarget() {
  const url = new URL(RUNTIME_HTTP);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`autostart refused for non-loopback runtime: ${url.hostname}`);
  }
  return {
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
  };
}

async function runtimeIsHealthy() {
  try {
    const response = await fetch(`${RUNTIME_HTTP}/api/status`, {
      signal: AbortSignal.timeout(800),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForRuntime(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await runtimeIsHealthy()) return true;
    await Bun.sleep(200);
  } while (Date.now() < deadline);
  return false;
}

async function pipeRuntimeLog(
  stream: ReadableStream<Uint8Array>,
  write: (line: string) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) write(`[hermes] ${line}`);
  }
  if (buffer.trim()) write(`[hermes] ${buffer}`);
}

async function startRuntime() {
  // A manually-started `hermes serve` prints its ready sentinel just before
  // the HTTP socket is observable. A short grace window avoids racing it and
  // momentarily spawning a second process that would lose the port bind.
  if (await waitForRuntime(1_200)) {
    console.log(`reusing Hermes runtime on ${RUNTIME_HTTP}`);
    return;
  }
  if (!RUNTIME_AUTOSTART) throw new Error("runtime Hermes offline and autostart is disabled");
  if (ownedRuntime) return;

  const target = runtimeTarget();
  console.log(`runtime offline; starting ${HERMES_COMMAND} serve on ${target.host}:${target.port}`);
  ownedRuntime = Bun.spawn(
    [HERMES_COMMAND, "serve", "--host", target.host, "--port", target.port],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HERMES_DASHBOARD_SESSION_TOKEN: RUNTIME_TOKEN,
      },
    },
  );
  void pipeRuntimeLog(ownedRuntime.stdout, console.log);
  void pipeRuntimeLog(ownedRuntime.stderr, console.error);

  const child = ownedRuntime;
  void child.exited.then((code) => {
    if (ownedRuntime === child) ownedRuntime = null;
    if (!shuttingDown) console.error(`Hermes runtime exited with code ${code}; it will restart on demand.`);
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await runtimeIsHealthy()) {
      // Give a losing concurrent process time to report EADDRINUSE. If ours
      // exited but the health check remains green, another runtime won the
      // race and must be treated as external (never killed by this broker).
      await Bun.sleep(150);
      if (ownedRuntime === child) {
        console.log(`Hermes runtime ready on ${RUNTIME_HTTP} (pid ${child.pid})`);
      } else {
        console.log(`reusing Hermes runtime on ${RUNTIME_HTTP}`);
      }
      return;
    }
    if (ownedRuntime !== child) throw new Error("Hermes runtime exited during startup");
    await Bun.sleep(250);
  }
  child.kill();
  if (ownedRuntime === child) ownedRuntime = null;
  throw new Error("Hermes runtime did not become ready within 20 seconds");
}

function ensureRuntime() {
  if (!runtimeBoot) {
    runtimeBoot = startRuntime().finally(() => {
      runtimeBoot = null;
    });
  }
  return runtimeBoot;
}

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function verifyTicket(raw: string): TicketPayload | null {
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", BRIDGE_SECRET).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(encoded)) as TicketPayload;
    if (!payload.profile || !payload.agentId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function upstreamUrl() {
  const url = new URL(RUNTIME_WS);
  if (RUNTIME_TOKEN) url.searchParams.set("token", RUNTIME_TOKEN);
  return url.toString();
}

function status(online: boolean, detail?: string) {
  return JSON.stringify({ __bridge__: "status", online, pid: ownedRuntime?.pid ?? null, detail });
}

async function loadSessionSnapshots(profile: string): Promise<SessionSnapshot[]> {
  await ensureRuntime();
  const query = new URLSearchParams({
    profile,
    limit: "1000",
    order: "recent",
    archived: "include",
  });
  const headers = new Headers({ Accept: "application/json" });
  if (RUNTIME_TOKEN) {
    headers.set("X-Hermes-Session-Token", RUNTIME_TOKEN);
    headers.set("Authorization", `Bearer ${RUNTIME_TOKEN}`);
  }
  const response = await fetch(`${RUNTIME_HTTP}/api/sessions?${query}`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Hermes sessions API ${response.status}`);
  const body = await response.json() as {
    sessions?: Array<Record<string, unknown>>;
  };
  return (body.sessions ?? []).flatMap((session) => {
    const id = session.id ?? session.session_id;
    if (typeof id !== "string" || !id) return [];
    return [{
      id,
      version: JSON.stringify([
        session.last_active ?? session.started_at ?? null,
        session.message_count ?? null,
        session.ended_at ?? null,
        session.archived ?? false,
      ]),
    }];
  });
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const sessionChangeHub = new SessionChangeHub({
  loadSessions: loadSessionSnapshots,
  hermesHome: process.env.HERMES_HOME,
  debounceMs: positiveNumber(process.env.HERMES_SESSION_CHANGE_DEBOUNCE_MS, 200),
  reconcileMs: positiveNumber(process.env.HERMES_SESSION_RECONCILE_MS, 0),
});

async function connectUpstream(client: Bun.ServerWebSocket<ClientData>) {
  try {
    client.send(status(false, "Démarrage du runtime Hermes…"));
    await ensureRuntime();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes runtime unavailable";
    console.error(message);
    if (client.readyState === WebSocket.OPEN) client.send(status(false, message));
    return;
  }

  if (client.readyState !== WebSocket.OPEN) return;
  const upstream = new WebSocket(upstreamUrl());
  client.data.upstream = upstream;
  client.send(status(false, "Connexion au runtime Hermes…"));

  upstream.onopen = () => {
    client.send(status(true));
    for (const frame of client.data.queue.splice(0)) upstream.send(frame);
  };
  upstream.onmessage = (event) => {
    if (client.readyState === WebSocket.OPEN) client.send(event.data);
  };
  upstream.onerror = () => {
    if (client.readyState === WebSocket.OPEN) client.send(status(false, "Runtime Hermes inaccessible."));
  };
  upstream.onclose = (event) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const detail = event.code === 4401
      ? "Token du runtime Hermes incorrect. Vérifiez HERMES_DASHBOARD_SESSION_TOKEN."
      : `Connexion Hermes fermée (${event.code}).`;
    client.send(status(false, detail));
    client.close(1011, `Hermes ${event.code}`);
  };
}

const VIEWER_METHODS = new Set(["session.list", "session.resume", "session.most_recent", "config.get"]);

function scopedRequest(raw: string, ticket: TicketPayload) {
  const request = JSON.parse(raw) as {
    jsonrpc?: string;
    id?: string | number;
    method?: string;
    params?: Record<string, unknown>;
  };
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return null;
  if (ticket.role === "viewer" && !VIEWER_METHODS.has(request.method)) {
    return {
      upstream: false as const,
      frame: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: 4030, message: "workspace is read-only" },
      }),
    };
  }
  request.params = { ...(request.params ?? {}), profile: ticket.profile };
  return { upstream: true as const, frame: JSON.stringify(request) };
}

function bridgeControl(raw: string) {
  const frame = JSON.parse(raw) as {
    __bridge__?: unknown;
    sessionId?: unknown;
  };
  if (frame.__bridge__ !== "session.subscribe" && frame.__bridge__ !== "session.unsubscribe") {
    return null;
  }
  if (typeof frame.sessionId !== "string" || !frame.sessionId || frame.sessionId.length > 256) {
    throw new Error("invalid session subscription");
  }
  return {
    kind: frame.__bridge__,
    sessionId: frame.sessionId,
  } as const;
}

const server = Bun.serve<ClientData>({
  hostname: HOST,
  port: PORT,
  fetch(request, bunServer) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("origin rejected", { status: 403 });
    const ticket = verifyTicket(url.searchParams.get("ticket") ?? "");
    if (!ticket) return new Response("invalid or expired ticket", { status: 401 });
    if (bunServer.upgrade(request, {
      data: { ticket, upstream: null, queue: [], sessionSubscriptions: new Map() },
    })) return;
    return new Response("websocket upgrade required", { status: 426 });
  },
  websocket: {
    open(client) {
      void connectUpstream(client);
    },
    message(client, message) {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      let scoped: ReturnType<typeof scopedRequest> = null;
      try {
        const control = bridgeControl(raw);
        if (control) {
          const existing = client.data.sessionSubscriptions.get(control.sessionId);
          if (control.kind === "session.unsubscribe") {
            existing?.();
            client.data.sessionSubscriptions.delete(control.sessionId);
          } else if (!existing) {
            const unsubscribe = sessionChangeHub.subscribe(
              client.data.ticket.profile,
              control.sessionId,
              (event) => {
                if (client.readyState !== WebSocket.OPEN) return;
                client.send(JSON.stringify({
                  __bridge__: "session.invalidated",
                  sessionId: event.sessionId,
                  cursor: event.cursor,
                  reason: event.reason,
                }));
              },
            );
            client.data.sessionSubscriptions.set(control.sessionId, unsubscribe);
          }
          return;
        }
        scoped = scopedRequest(raw, client.data.ticket);
      } catch {
        client.close(1003, "invalid JSON-RPC");
        return;
      }
      if (!scoped) return;
      if (!scoped.upstream) {
        client.send(scoped.frame);
        return;
      }
      const upstream = client.data.upstream;
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(scoped.frame);
      else if (client.data.queue.length < 20) client.data.queue.push(scoped.frame);
    },
    close(client) {
      client.data.upstream?.close(1000, "browser disconnected");
      client.data.upstream = null;
      client.data.queue.length = 0;
      for (const unsubscribe of client.data.sessionSubscriptions.values()) unsubscribe();
      client.data.sessionSubscriptions.clear();
    },
  },
});

console.log(`listening on ws://${HOST}:${PORT}; upstream ${RUNTIME_WS}`);
void ensureRuntime().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
});

function shutdown() {
  shuttingDown = true;
  sessionChangeHub.close();
  ownedRuntime?.kill();
  ownedRuntime = null;
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export {};
