"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  isAgentEvent,
  isBridgeFrame,
  isRpcResponse,
  M,
  type AgentEvent,
  type ApprovalChoice,
  type BridgeSessionInvalidatedFrame,
  type BridgeSessionSubscriptionFrame,
  type JsonObject,
  type SessionCreated,
  type SessionInfo,
  type SessionSummary,
  type HermesModelOption,
  type HermesToolset,
  type HandoffFailResult,
  type HandoffRequestResult,
  type HandoffStateResult,
} from "@/lib/hermes/protocol";

export type ConnState = "connecting" | "open" | "closed";
type EventHandler = (ev: AgentEvent) => void;
type StateHandler = () => void;
type SessionInvalidationHandler = (event: BridgeSessionInvalidatedFrame) => void;

const CALL_TIMEOUT_MS = 30_000;

/** Browser-side JSON-RPC client over the bridge WebSocket. */
export class HermesClient {
  connState: ConnState = "closed";
  agentOnline = false;

  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: JsonObject) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private events = new Set<EventHandler>();
  private stateListeners = new Set<StateHandler>();
  private sessionInvalidationListeners = new Map<string, Set<SessionInvalidationHandler>>();
  private backoff = 500;
  private closedByUser = false;
  private generation = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ticketEndpoint?: string) {}

  connect() {
    if (
      !this.closedByUser
      && (
        this.connState === "connecting"
        || this.ws?.readyState === WebSocket.OPEN
        || this.ws?.readyState === WebSocket.CONNECTING
        || this.reconnectTimer !== null
      )
    ) return;
    this.closedByUser = false;
    this.generation += 1;
    this.clearReconnectTimer();
    void this.open(this.generation);
  }

  waitUntilOpen(timeoutMs = 20_000): Promise<void> {
    if (this.connState === "open" && this.agentOnline) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      let unsubscribe = () => {};
      const cleanup = () => {
        clearTimeout(timer);
        unsubscribe();
      };
      const check = () => {
        if (this.connState === "open" && this.agentOnline) {
          cleanup();
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          cleanup();
          reject(new Error("Hermes runtime connection timed out"));
        }
      };
      const timer = setTimeout(check, timeoutMs);
      unsubscribe = this.onStateChange(check);
      check();
    });
  }

  private async open(generation: number) {
    if (this.closedByUser || generation !== this.generation) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setConn("connecting");
    let ws: WebSocket;
    try {
      if (!this.ticketEndpoint) throw new Error("runtime ticket endpoint missing");
      const response = await fetch(this.ticketEndpoint, { method: "POST" });
      if (!response.ok) throw new Error("runtime ticket rejected");
      const { ticket, gatewayUrl } = await response.json() as { ticket: string; gatewayUrl: string };
      if (!ticket || !gatewayUrl) throw new Error("runtime ticket response invalid");
      if (this.closedByUser || generation !== this.generation) return;
      const url = new URL(gatewayUrl);
      if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new Error("runtime gateway URL invalid");
      }
      url.searchParams.set("ticket", ticket);
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect(generation);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws || generation !== this.generation) return;
      this.backoff = 500;
      this.setConn("open");
      for (const sessionId of this.sessionInvalidationListeners.keys()) {
        this.sendSessionSubscription("session.subscribe", sessionId);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws || generation !== this.generation) return;
      this.ws = null;
      this.setConn("closed");
      this.setAgent(false);
      this.failAllPending("connection closed");
      this.scheduleReconnect(generation);
    };
    ws.onerror = () => {
      /* onclose handles retry */
    };
    ws.onmessage = (ev) => {
      if (this.ws === ws && generation === this.generation) {
        this.onMessage(ev.data);
      }
    };
  }

  private scheduleReconnect(generation: number) {
    if (this.closedByUser || generation !== this.generation || this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 8_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser && generation === this.generation) {
        void this.open(generation);
      }
    }, delay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private onMessage(data: unknown) {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof data === "string" ? data : String(data));
    } catch {
      return;
    }
    if (isBridgeFrame(msg)) {
      if (msg.__bridge__ === "status") {
        this.setAgent(msg.online);
      } else {
        for (const handler of this.sessionInvalidationListeners.get(msg.sessionId) ?? []) {
          handler(msg);
        }
      }
      return;
    }
    if (isAgentEvent(msg)) {
      for (const h of this.events) h(msg);
      return;
    }
    if (isRpcResponse(msg)) {
      const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else entry.resolve(msg.result ?? {});
    }
  }

  call(method: string, params: JsonObject = {}): Promise<JsonObject> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("bridge not connected"));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise<JsonObject>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(payload);
    });
  }

  /** Fire-and-forget: used for responses to agent prompts (no meaningful result needed). */
  notify(method: string, params: JsonObject = {}) {
    this.call(method, params).catch(() => {
      /* best-effort */
    });
  }

  onEvent(handler: EventHandler): () => void {
    this.events.add(handler);
    return () => this.events.delete(handler);
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  onSessionInvalidated(sessionId: string, handler: SessionInvalidationHandler): () => void {
    const listeners = this.sessionInvalidationListeners.get(sessionId) ?? new Set();
    const first = listeners.size === 0;
    listeners.add(handler);
    this.sessionInvalidationListeners.set(sessionId, listeners);
    if (first) this.sendSessionSubscription("session.subscribe", sessionId);

    return () => {
      listeners.delete(handler);
      if (listeners.size > 0) return;
      this.sessionInvalidationListeners.delete(sessionId);
      this.sendSessionSubscription("session.unsubscribe", sessionId);
    };
  }

  disconnect() {
    this.closedByUser = true;
    this.generation += 1;
    this.clearReconnectTimer();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setConn("closed");
    this.setAgent(false);
    this.failAllPending("connection closed");
  }

  private setConn(s: ConnState) {
    if (this.connState !== s) {
      this.connState = s;
      this.emitState();
    }
  }
  private setAgent(v: boolean) {
    if (this.agentOnline !== v) {
      this.agentOnline = v;
      this.emitState();
    }
  }
  private emitState() {
    for (const h of this.stateListeners) h();
  }
  private failAllPending(reason: string) {
    for (const [, e] of this.pending) {
      clearTimeout(e.timer);
      e.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private sendSessionSubscription(
    kind: BridgeSessionSubscriptionFrame["__bridge__"],
    sessionId: string,
  ) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ __bridge__: kind, sessionId } satisfies BridgeSessionSubscriptionFrame));
  }

  // ---- typed convenience wrappers ----
  sessionList(limit = 50) {
    return this.call(M.sessionList, { limit }) as unknown as Promise<{ sessions?: SessionSummary[] }>;
  }
  sessionCreate(params: JsonObject = {}) {
    return this.call(M.sessionCreate, params) as unknown as Promise<SessionCreated>;
  }
  sessionResume(storedId: string) {
    return this.call(M.sessionResume, { session_id: storedId }) as unknown as Promise<SessionCreated>;
  }
  sessionMostRecent() {
    return this.call(M.sessionMostRecent, {}) as unknown as Promise<{ session_id: string | null }>;
  }
  promptSubmit(sessionId: string, text: string) {
    return this.call(M.promptSubmit, { session_id: sessionId, text });
  }
  approvalRespond(sessionId: string, choice: ApprovalChoice, all = false) {
    this.notify(M.approvalRespond, { session_id: sessionId, choice, all });
  }
  clarifyRespond(requestId: string, answer: string) {
    this.notify(M.clarifyRespond, { request_id: requestId, answer });
  }
  sudoRespond(requestId: string, password: string) {
    this.notify(M.sudoRespond, { request_id: requestId, password });
  }
  secretRespond(requestId: string, value: string) {
    this.notify(M.secretRespond, { request_id: requestId, value });
  }
  interrupt(sessionId: string) {
    this.notify(M.sessionInterrupt, { session_id: sessionId });
  }
  sessionClose(sessionId: string) {
    return this.call(M.sessionClose, { session_id: sessionId });
  }
  sessionDelete(storedSessionId: string) {
    return this.call(M.sessionDelete, { session_id: storedSessionId });
  }
  sessionTitle(sessionId: string, title: string) {
    return this.call(M.sessionTitle, { session_id: sessionId, title });
  }
  sessionInfo(sessionId: string) {
    return this.call(M.sessionInfo, { session_id: sessionId }) as unknown as Promise<SessionInfo>;
  }
  sessionCwdSet(sessionId: string, cwd: string) {
    return this.call(M.sessionCwdSet, { session_id: sessionId, cwd });
  }
  configGet(key: string) {
    return this.call(M.configGet, { key });
  }
  configSet(key: string, value: JsonObject[string], sessionId?: string, scope?: string) {
    return this.call(M.configSet, {
      key,
      value,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(scope ? { scope } : {}),
    });
  }
  modelOptions() {
    return this.call(M.modelOptions) as unknown as Promise<{
      providers?: HermesModelOption[];
      model?: string;
      provider?: string;
    }>;
  }
  toolsList() {
    return this.call(M.toolsList) as unknown as Promise<{ toolsets?: HermesToolset[] }>;
  }
  completePath(word: string, cwd?: string) {
    return this.call(M.completePath, { word, ...(cwd ? { cwd } : {}) });
  }
  completeSlash(text: string) {
    return this.call(M.completeSlash, { text });
  }
  commandDispatch(sessionId: string, name: string, arg = "") {
    return this.call(M.commandDispatch, { session_id: sessionId, name, arg });
  }
  slashExec(sessionId: string, command: string) {
    return this.call(M.slashExec, { session_id: sessionId, command });
  }
  handoffRequest(sessionId: string, platform: string) {
    return this.call(M.handoffRequest, {
      session_id: sessionId,
      platform,
    }) as unknown as Promise<HandoffRequestResult>;
  }
  handoffState(sessionId: string) {
    return this.call(M.handoffState, {
      session_id: sessionId,
    }) as unknown as Promise<HandoffStateResult>;
  }
  handoffFail(sessionId: string, error: string) {
    return this.call(M.handoffFail, {
      session_id: sessionId,
      error,
    }) as unknown as Promise<HandoffFailResult>;
  }
  imageAttachBytes(sessionId: string, contentBase64: string, filename: string) {
    return this.call(M.imageAttachBytes, {
      session_id: sessionId,
      content_base64: contentBase64,
      filename,
    });
  }
  pdfAttach(sessionId: string, contentBase64: string, filename: string) {
    return this.call(M.pdfAttach, {
      session_id: sessionId,
      content_base64: contentBase64,
      filename,
    });
  }
  fileAttach(sessionId: string, dataUrl: string, name: string) {
    return this.call(M.fileAttach, { session_id: sessionId, data_url: dataUrl, name });
  }
}

// ---- React glue ----

const HermesContext = createContext<HermesClient | null>(null);

export function HermesProvider({
  children,
  ticketEndpoint,
}: {
  children: ReactNode;
  ticketEndpoint: string;
}) {
  const [client] = useState(() => new HermesClient(ticketEndpoint));

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  return createElement(HermesContext.Provider, { value: client }, children);
}

export function useHermes(): HermesClient {
  const client = useContext(HermesContext);
  if (!client) throw new Error("useHermes must be used within <HermesProvider>");
  return client;
}

/** Subscribe to connection + agent-online state as React state. */
export function useHermesState(): { conn: ConnState; agentOnline: boolean } {
  const client = useHermes();
  const [, force] = useState(0);
  useEffect(() => client.onStateChange(() => force((n) => n + 1)), [client]);
  return { conn: client.connState, agentOnline: client.agentOnline };
}
