/**
 * Hermes tui_gateway JSON-RPC wire contract (subset used by hermes-pilot).
 * Source: ~/.hermes/hermes-agent/tui_gateway/server.py — pinned to DESKTOP_BACKEND_CONTRACT = 3.
 * All method/event names are centralised here so protocol drift is a one-file change.
 */

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject {
  [k: string]: JsonValue | undefined;
}

/** A server->client event: {jsonrpc, method:"event", params:{type, session_id?, payload}}. */
export interface AgentEvent {
  jsonrpc: "2.0";
  method: "event";
  params: {
    type: string;
    session_id?: string | null;
    payload?: JsonObject;
  };
}

/** A server->client response to a request we sent. */
export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: JsonObject;
  error?: { code: number; message: string };
}

/** Bridge status frame (not from the agent). */
export interface BridgeStatusFrame {
  __bridge__: "status";
  online: boolean;
  pid: number | null;
  detail?: string;
}

/** The persisted session changed outside this browser's live RPC stream. */
export interface BridgeSessionInvalidatedFrame {
  __bridge__: "session.invalidated";
  sessionId: string;
  cursor: number;
  reason: "subscribed" | "changed" | "reconcile";
}

export type BridgeFrame = BridgeStatusFrame | BridgeSessionInvalidatedFrame;

export interface BridgeSessionSubscriptionFrame {
  __bridge__: "session.subscribe" | "session.unsubscribe";
  sessionId: string;
}

export type IncomingFrame = AgentEvent | RpcResponse | BridgeFrame;

export function isBridgeFrame(m: unknown): m is BridgeFrame {
  if (!m || typeof m !== "object" || !("__bridge__" in m)) return false;
  const frame = m as Record<string, unknown>;
  if (frame.__bridge__ === "status") return typeof frame.online === "boolean";
  return frame.__bridge__ === "session.invalidated"
    && typeof frame.sessionId === "string"
    && typeof frame.cursor === "number"
    && ["subscribed", "changed", "reconcile"].includes(String(frame.reason));
}
export function isAgentEvent(m: unknown): m is AgentEvent {
  return !!m && typeof m === "object" && (m as { method?: unknown }).method === "event";
}
export function isRpcResponse(m: unknown): m is RpcResponse {
  return (
    !!m &&
    typeof m === "object" &&
    "id" in m &&
    (m as { method?: unknown }).method === undefined
  );
}

/** Client -> server method names. */
export const M = {
  sessionCreate: "session.create",
  sessionList: "session.list",
  sessionResume: "session.resume",
  sessionMostRecent: "session.most_recent",
  sessionInterrupt: "session.interrupt",
  sessionClose: "session.close",
  sessionDelete: "session.delete",
  sessionTitle: "session.title",
  sessionInfo: "session.info",
  sessionContextBreakdown: "session.context_breakdown",
  sessionCwdSet: "session.cwd.set",
  promptSubmit: "prompt.submit",
  approvalRespond: "approval.respond",
  clarifyRespond: "clarify.respond",
  sudoRespond: "sudo.respond",
  secretRespond: "secret.respond",
  configGet: "config.get",
  configSet: "config.set",
  modelOptions: "model.options",
  toolsList: "tools.list",
  toolsShow: "tools.show",
  completePath: "complete.path",
  completeSlash: "complete.slash",
  commandDispatch: "command.dispatch",
  slashExec: "slash.exec",
  handoffRequest: "handoff.request",
  handoffState: "handoff.state",
  handoffFail: "handoff.fail",
  imageAttachBytes: "image.attach_bytes",
  pdfAttach: "pdf.attach",
  fileAttach: "file.attach",
} as const;

/** Server -> client event `params.type` names we render. */
export const E = {
  gatewayReady: "gateway.ready",
  sessionInfo: "session.info",
  messageStart: "message.start",
  messageDelta: "message.delta",
  messageComplete: "message.complete",
  reasoningDelta: "reasoning.delta",
  reasoningAvailable: "reasoning.available",
  thinkingDelta: "thinking.delta",
  statusUpdate: "status.update",
  error: "error",
  toolStart: "tool.start",
  toolProgress: "tool.progress",
  toolComplete: "tool.complete",
  subagentStart: "subagent.start",
  subagentProgress: "subagent.progress",
  subagentComplete: "subagent.complete",
  approvalRequest: "approval.request",
  clarifyRequest: "clarify.request",
  sudoRequest: "sudo.request",
  secretRequest: "secret.request",
} as const;

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export type HandoffLifecycleState = "" | "pending" | "running" | "completed" | "failed";

export interface HandoffRequestResult {
  queued?: boolean;
  session_key?: string;
  platform?: string;
  home_name?: string;
}

export interface HandoffStateResult {
  state: HandoffLifecycleState;
  platform?: string;
  error?: string;
}

export interface HandoffFailResult {
  failed?: boolean;
  state: HandoffLifecycleState;
}

export interface SessionSummary {
  id: string;
  title?: string | null;
  preview?: string | null;
  started_at?: number | string | null;
  message_count?: number | null;
  source?: string | null;
}

/** One MCP server as reported by the runtime (`get_mcp_status`). */
export interface HermesMcpServer {
  name: string;
  enabled?: boolean;
  connected?: boolean;
  status?: string;
  tools?: string[];
  [k: string]: JsonValue | undefined;
}

export type ApprovalMode = "manual" | "smart" | "off";

export interface SessionInfo {
  model?: string;
  provider?: string;
  reasoning_effort?: string;
  service_tier?: string;
  fast?: boolean;
  yolo?: boolean;
  approval_mode?: ApprovalMode;
  /** Tool names grouped by toolset: `{ shell: ["run", ...], file: [...] }`. */
  tools?: Record<string, string[]>;
  skills?: unknown;
  /** External MCP connectors and their live status. */
  mcp_servers?: HermesMcpServer[];
  cwd?: string;
  branch?: string;
  personality?: string;
  system_prompt?: string;
  desktop_contract?: number;
  profile_name?: string;
  version?: string;
  install_warning?: string;
  running?: boolean;
  title?: string;
  usage?: {
    model?: string;
    input?: number;
    output?: number;
    reasoning?: number;
    prompt?: number;
    completion?: number;
    total?: number;
    calls?: number;
    context_used?: number;
    context_max?: number;
    context_percent?: number;
    compressions?: number;
  };
}

export interface SessionContextBreakdown {
  context_used?: number;
  context_max?: number;
  context_percent?: number;
  estimated_total?: number;
  model?: string;
}

export interface HermesModelOption {
  slug: string;
  name?: string;
  models?: string[];
  authenticated?: boolean;
  capabilities?: Record<string, { fast?: boolean; reasoning?: boolean }>;
}

export interface HermesToolset {
  name: string;
  description?: string;
  enabled?: boolean;
  tools?: string[];
}

export interface SessionCreated {
  session_id: string;
  stored_session_id?: string;
  message_count?: number;
  messages?: JsonObject[];
  info?: SessionInfo;
  running?: boolean;
  status?: string;
}
