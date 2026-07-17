"use client";

import {
  useAuiState,
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
  unstable_defaultDirectiveFormatter,
  WebSpeechDictationAdapter,
  type AppendMessage,
  type AssistantRuntime,
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
  type RemoteThreadListAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  E,
  type AgentEvent,
  type ApprovalChoice,
  type BridgeSessionInvalidatedFrame,
  type HermesModelOption,
  type HandoffLifecycleState,
  type JsonObject,
  type SessionCreated,
  type SessionContextBreakdown,
  type SessionInfo,
} from "@/lib/hermes/protocol";
import { useHermes, type HermesClient } from "@/lib/hermes/client";
import type {
  HermesComposerController,
  HermesComposerModel,
  HermesEffort,
  HermesPermission,
} from "@/components/shared/chat/runtime/hermes-composer-context";
import { useChatRoutes } from "@/components/shared/chat/chat-routes-context";
import { sessionOrigin } from "@/lib/hermes/session-origin";
import { useSessionMetricsStore } from "@/lib/shared/chat/session-metrics-store";
import { RequestCoalescer } from "@/lib/shared/chat/request-coalescer";
import { shouldInvalidateSessionMetrics } from "@/lib/shared/chat/session-invalidation-policy";
import {
  AGENT_CREATE_COMMAND,
  agentCreatePayload,
  parseAgentCreateCommand,
} from "@/lib/agents/agent-create-command";
import {
  getReasoningControlConfig,
  isReasoningControlId,
  normalizeReasoningControlId,
} from "@/components/shared/chat/constants/reasoning-config";
import type { HermesApprovalRequest } from "@/components/shared/chat/assistant-ui/tool-approval-banner";
import {
  appendAssistantReasoning,
  appendAssistantText,
  appendAssistantToolStart,
  coerceToolResultText,
  ensureRunningAssistant,
  prepareMessagesForEdit,
  prepareMessagesForReload,
  setAssistantReasoningIfEmpty,
  sliceMessagesUntil,
  textFromThreadUserMessage,
  toolArgsFromPayload,
  toolArgsTextFromPayload,
  updateAssistantTool,
} from "@/components/shared/chat/runtime/hermes-message-updates";
import {
  historyToMessages,
  historyVersion,
} from "@/components/shared/chat/runtime/hermes-history-messages";

const MAX_TITLE_LENGTH = 50;
const HANDOFF_POLL_INTERVAL_MS = 800;
const HANDOFF_TIMEOUT_MS = 60_000;

type SessionListRow = {
  id: string;
  title: string;
  source: string | null;
  startedAt: number | string | null;
  lastActiveAt: number | string | null;
  messageCount: number;
  archived: boolean;
};

type LiveSession = {
  liveId: string;
  storedId: string;
  messages: JsonObject[];
  running: boolean;
  info?: SessionInfo;
};

type ComposerPreferences = {
  provider: string;
  model: string;
  effort: HermesEffort;
  reasoningSupported: boolean;
  fast: boolean;
  permission: HermesPermission;
  planMode: boolean;
  webSearch: boolean;
};

type DefaultInferencePreferences = Pick<
  ComposerPreferences,
  "provider" | "model" | "effort" | "reasoningSupported"
>;

type SessionListener = (event: AgentEvent) => void;

function dateFromHermes(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return new Date(value < 10_000_000_000 ? value * 1_000 : value);
  }
  if (typeof value === "string" && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function textFromContent(message: AppendMessage) {
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function buildTitle(messages: readonly ThreadMessage[]) {
  const first = messages.find((message) => message.role === "user");
  const textPart = first?.content.find((part) => part.type === "text");
  if (!textPart || textPart.type !== "text") return "Nouvelle session";
  const text = unstable_defaultDirectiveFormatter
    .parse(textPart.text)
    .map((segment) => segment.kind === "text" ? segment.text : segment.label)
    .join("")
    .trim();
  if (!text) return "Nouvelle session";
  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH - 3)}...`
    : text;
}

function userMessage(
  id: string,
  text: string,
  attachments: CompleteAttachment[] = [],
  createdAt = new Date(),
): ThreadMessage {
  return {
    id,
    role: "user",
    createdAt,
    content: [{ type: "text", text }],
    attachments,
    metadata: { custom: {} },
  };
}

function assistantMessage(
  id: string,
  text: string,
  running = false,
  createdAt = new Date(),
): ThreadMessage {
  return {
    id,
    role: "assistant",
    createdAt,
    content: [{ type: "text", text }],
    status: running
      ? { type: "running" }
      : { type: "complete", reason: "stop" },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function dataUrlPayload(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

const hermesAttachmentAdapter: AttachmentAdapter = {
  accept: "*",
  async add({ file }): Promise<PendingAttachment> {
    const type = file.type.startsWith("image/")
      ? "image"
      : file.type === "application/pdf" || file.type.startsWith("text/")
        ? "document"
        : "file";
    return {
      id: crypto.randomUUID(),
      type,
      name: file.name,
      contentType: file.type || "application/octet-stream",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async remove() {},
  async send(attachment): Promise<CompleteAttachment> {
    const dataUrl = await fileToDataUrl(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content: attachment.type === "image"
        ? [{ type: "image", image: dataUrl, filename: attachment.name }]
        : [{
            type: "file",
            data: dataUrl,
            filename: attachment.name,
            mimeType: attachment.contentType ?? "application/octet-stream",
          }],
    };
  },
};

function flattenModels(providers: HermesModelOption[] = []): HermesComposerModel[] {
  return providers.flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      provider: provider.slug,
      providerLabel: provider.name || provider.slug,
      model,
      supportsFast: provider.capabilities?.[model]?.fast === true,
      supportsReasoning: provider.capabilities?.[model]?.reasoning !== false,
    })),
  );
}

function resolveComposerReasoning(
  models: readonly HermesComposerModel[],
  provider: string,
  model: string,
  effort: HermesEffort,
) {
  const selected = models.find(
    (item) => item.provider === provider && item.model === model,
  );
  const config = getReasoningControlConfig(
    provider,
    model,
    selected?.supportsReasoning ?? true,
  );
  return {
    effort: normalizeReasoningControlId(
      provider,
      model,
      effort,
      selected?.supportsReasoning ?? true,
    ) ?? effort,
    reasoningSupported: config !== null,
  };
}

function mergeComposerModels(...groups: HermesComposerModel[][]) {
  const seen = new Set<string>();
  return groups.flatMap((models) => models.filter((model) => {
    const key = `${model.provider}:${model.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function isMissingSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:4007.*session not found|session supprimée)/i.test(message);
}

function hasMeasuredContext(info: SessionInfo | undefined) {
  return typeof info?.usage?.context_used === "number"
    && Number.isFinite(info.usage.context_used)
    && info.usage.context_used > 0
    && typeof info.usage.context_max === "number"
    && Number.isFinite(info.usage.context_max)
    && info.usage.context_max > 0;
}

function completionRows(value: JsonObject): { id: string; label: string; description?: string; value?: string }[] {
  const rows = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.completions)
      ? value.completions
      : Array.isArray(value.commands)
        ? value.commands
        : [];
  return rows.flatMap((row, index) => {
    if (typeof row === "string") return [{ id: row, label: row, value: row }];
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as JsonObject;
    const label = [item.label, item.command, item.value, item.name, item.path]
      .find((entry): entry is string => typeof entry === "string");
    if (!label) return [];
    const description = [item.description, item.detail]
      .find((entry): entry is string => typeof entry === "string");
    return [{ id: `${label}-${index}`, label, value: label, description }];
  });
}

class HermesSessionManager {
  private readonly liveByStored = new Map<string, LiveSession>();
  private readonly sessionByThread = new Map<string, Promise<LiveSession>>();
  private readonly listRequests = new RequestCoalescer<string, SessionListRow[]>();
  private readonly historyRequests = new RequestCoalescer<string, JsonObject[]>();
  private readonly listeners = new Map<string, Set<SessionListener>>();
  private readonly bufferedEvents = new Map<string, AgentEvent[]>();
  private readonly deletedStoredIds = new Set<string>();
  private unsubscribe?: () => void;

  constructor(
    private readonly client: HermesClient,
    private readonly sessionsEndpoint: string,
    private readonly getPreferences: () => ComposerPreferences,
    private readonly onInfo: (storedId: string, info: SessionInfo) => void,
    private readonly onContextBreakdown: (storedId: string, breakdown: SessionContextBreakdown) => void,
  ) {}

  start() {
    this.unsubscribe = this.client.onEvent((event) => {
      const liveId = event.params.session_id;
      if (!liveId) return;
      const session = [...this.liveByStored.values()].find((item) => item.liveId === liveId);
      if (!session) return;
      if (event.params.type === E.sessionInfo) {
        session.info = event.params.payload as SessionInfo;
        this.onInfo(session.storedId, session.info);
        this.refreshContextBreakdown(session);
      }
      const listeners = this.listeners.get(session.storedId);
      if (!listeners?.size) {
        const buffered = this.bufferedEvents.get(session.storedId) ?? [];
        buffered.push(event);
        this.bufferedEvents.set(session.storedId, buffered.slice(-200));
        return;
      }
      for (const listener of listeners) listener(event);
    });
    return () => this.unsubscribe?.();
  }

  async list(): Promise<SessionListRow[]> {
    return this.listRequests.run(this.sessionsEndpoint, async () => {
      await this.client.waitUntilOpen();
      const response = await fetch(this.sessionsEndpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`Hermes sessions API ${response.status}`);
      const body = await response.json() as { sessions?: SessionListRow[] };
      return body.sessions ?? [];
    });
  }

  async loadPersistedHistory(storedId: string): Promise<JsonObject[]> {
    return this.historyRequests.run(storedId, async () => {
      const response = await fetch(
        `${this.sessionsEndpoint}/${encodeURIComponent(storedId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Hermes session history API ${response.status}`);
      const body = await response.json() as { messages?: JsonObject[] };
      return body.messages ?? [];
    });
  }

  subscribePersistedHistory(
    storedId: string,
    listener: (event: BridgeSessionInvalidatedFrame) => void,
  ) {
    return this.client.onSessionInvalidated(storedId, listener);
  }

  async create(threadId: string): Promise<LiveSession> {
    const existing = this.sessionByThread.get(threadId);
    if (existing) return existing;
    const pending = (async () => {
      await this.client.waitUntilOpen();
      const preferences = this.getPreferences();
      const created = await this.client.sessionCreate({
        source: "web",
        ...(preferences.provider ? { provider: preferences.provider } : {}),
        ...(preferences.model ? { model: preferences.model } : {}),
        ...(preferences.reasoningSupported
          ? { reasoning_effort: preferences.effort }
          : {}),
        fast: preferences.fast,
      });
      return this.register(created);
    })();
    this.sessionByThread.set(threadId, pending);
    try {
      return await pending;
    } catch (error) {
      this.sessionByThread.delete(threadId);
      throw error;
    }
  }

  async resume(storedId: string): Promise<LiveSession> {
    if (this.deletedStoredIds.has(storedId)) throw new Error("Session supprimée");
    const active = this.liveByStored.get(storedId);
    if (active) return active;
    const existing = this.sessionByThread.get(storedId);
    if (existing) return existing;
    const pending = (async () => {
      await this.client.waitUntilOpen();
      return this.register(await this.client.sessionResume(storedId), storedId);
    })();
    this.sessionByThread.set(storedId, pending);
    try {
      return await pending;
    } catch (error) {
      this.sessionByThread.delete(storedId);
      throw error;
    }
  }

  ensure(threadId: string, storedId?: string) {
    return storedId ? this.resume(storedId) : this.create(threadId);
  }

  async handoff(
    threadId: string,
    storedId: string | undefined,
    platform: "telegram",
    onProgress?: (state: HandoffLifecycleState) => void,
  ) {
    const session = await this.ensure(threadId, storedId);
    onProgress?.("pending");
    await this.client.handoffRequest(session.liveId, platform);

    const deadline = Date.now() + HANDOFF_TIMEOUT_MS;
    let lastState: HandoffLifecycleState = "pending";

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, HANDOFF_POLL_INTERVAL_MS));

      let record;
      try {
        record = await this.client.handoffState(session.liveId);
      } catch {
        continue;
      }

      const state = record.state || "pending";
      if (state !== lastState) {
        lastState = state;
        onProgress?.(state);
      }
      if (state === "completed") return;
      if (state === "failed") {
        throw new Error(record.error || "Le transfert vers Telegram a échoué.");
      }
    }

    const timeoutMessage = "Le transfert vers Telegram a expiré. Vérifiez que le gateway est actif puis réessayez.";
    const cleanup = await this.client
      .handoffFail(session.liveId, timeoutMessage)
      .catch(() => null);
    if (cleanup?.state === "completed") {
      onProgress?.("completed");
      return;
    }
    throw new Error(timeoutMessage);
  }

  subscribe(storedId: string, listener: SessionListener) {
    const group = this.listeners.get(storedId) ?? new Set<SessionListener>();
    group.add(listener);
    this.listeners.set(storedId, group);
    for (const event of this.bufferedEvents.get(storedId) ?? []) listener(event);
    this.bufferedEvents.delete(storedId);
    return () => {
      group.delete(listener);
      if (group.size === 0) this.listeners.delete(storedId);
    };
  }

  async submit(session: LiveSession, text: string) {
    const preferences = this.getPreferences();
    let prompt = text;
    if (preferences.planMode) {
      const dispatched = await this.client.commandDispatch(session.liveId, "plan", text);
      if (typeof dispatched.message === "string") prompt = dispatched.message;
    } else if (text.trimStart().startsWith("/")) {
      const dispatched = await this.client.slashExec(session.liveId, text.trim());
      if (typeof dispatched.message === "string") prompt = dispatched.message;
      if (dispatched.type === "prefill") return;
    }
    if (preferences.webSearch) {
      prompt = `${prompt}\n\n[Turn instruction: use the web_search tool when current external information is needed.]`;
    }
    await this.client.promptSubmit(session.liveId, prompt);
  }

  async uploadAttachments(session: LiveSession, attachments: readonly CompleteAttachment[]) {
    const refs: string[] = [];
    for (const attachment of attachments) {
      const part = attachment.content[0];
      if (!part) continue;
      if (part.type === "image") {
        await this.client.imageAttachBytes(
          session.liveId,
          dataUrlPayload(part.image),
          attachment.name,
        );
        continue;
      }
      if (part.type !== "file") continue;
      if (attachment.contentType === "application/pdf") {
        await this.client.pdfAttach(
          session.liveId,
          dataUrlPayload(part.data),
          attachment.name,
        );
        continue;
      }
      const response = await this.client.fileAttach(session.liveId, part.data, attachment.name);
      if (typeof response.ref_text === "string") refs.push(response.ref_text);
    }
    return refs;
  }

  async configure(storedId: string | undefined, key: string, value: JsonObject[string], scope?: string) {
    if (!storedId) return;
    const session = await this.resume(storedId);
    await this.client.configSet(key, value, session.liveId, scope);
    session.info = await this.client.sessionInfo(session.liveId);
    this.onInfo(storedId, session.info);
    this.refreshContextBreakdown(session);
  }

  async cancel(storedId: string) {
    const session = this.liveByStored.get(storedId);
    if (session) this.client.interrupt(session.liveId);
  }

  async rename(storedId: string, title: string) {
    await this.updateSession(storedId, { title });
  }

  async archive(storedId: string, archived: boolean) {
    await this.updateSession(storedId, { archived });
  }

  async delete(storedId: string) {
    const session = this.liveByStored.get(storedId);
    if (session) {
      try {
        await this.client.sessionClose(session.liveId);
      } catch (error) {
        if (!isMissingSessionError(error)) throw error;
      }
    }
    const response = await fetch(`${this.sessionsEndpoint}/${encodeURIComponent(storedId)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`Hermes sessions API ${response.status}`);
    this.deletedStoredIds.add(storedId);
    useSessionMetricsStore.getState().remove(storedId);
    this.liveByStored.delete(storedId);
    this.listeners.delete(storedId);
    this.bufferedEvents.delete(storedId);
    for (const [threadId, pending] of this.sessionByThread) {
      if (threadId === storedId) this.sessionByThread.delete(threadId);
      void pending.then((cached) => {
        if (cached.storedId === storedId) this.sessionByThread.delete(threadId);
      }).catch(() => {});
    }
  }

  private async updateSession(storedId: string, patch: { title?: string; archived?: boolean }) {
    const response = await fetch(`${this.sessionsEndpoint}/${encodeURIComponent(storedId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(`Hermes sessions API ${response.status}`);
  }

  private register(created: SessionCreated, fallbackStoredId?: string): LiveSession {
    const storedId = created.stored_session_id ?? fallbackStoredId ?? created.session_id;
    const session = {
      liveId: created.session_id,
      storedId,
      messages: created.messages ?? [],
      running: created.running === true,
      info: created.info,
    };
    this.liveByStored.set(storedId, session);
    if (created.info) this.onInfo(storedId, created.info);
    this.refreshContextBreakdown(session);
    void fetch(this.sessionsEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hermesSessionId: storedId }),
    });
    return session;
  }

  private refreshContextBreakdown(session: LiveSession) {
    if (hasMeasuredContext(session.info)) return;
    void this.client.sessionContextBreakdown(session.liveId)
      .then((breakdown) => this.onContextBreakdown(session.storedId, breakdown))
      .catch(() => {});
  }
}

function useHermesThreadRuntime(
  manager: HermesSessionManager,
  agentsEndpoint: string,
  onApprovalRequest?: (request: HermesApprovalRequest | null) => void,
): AssistantRuntime {
  const router = useRouter();
  const threadId = useAuiState((state) => state.threadListItem.id);
  const remoteId = useAuiState((state) => state.threadListItem.remoteId);
  const source = useAuiState((state) => state.threadListItem.custom?.source);
  const syncPersistedHistory = sessionOrigin(source) !== null;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [isLoading, setIsLoading] = useState(Boolean(remoteId));
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const persistedHistoryVersion = useRef("");
  const startedLocally = useRef(false);
  const activeStoredId = useRef(remoteId);
  const { baseWithAgent } = useChatRoutes();
  const dictation = useMemo(
    () => WebSpeechDictationAdapter.isSupported()
      ? new WebSpeechDictationAdapter({ language: "fr-FR" })
      : undefined,
    [],
  );

  useEffect(() => {
    if (!remoteId || startedLocally.current) return;
    let cancelled = false;
    setIsLoading(true);
    void manager.resume(remoteId)
      .then(async (session) => {
        if (cancelled) return;
        activeStoredId.current = session.storedId;
        setMessages(historyToMessages(session.messages));
        setIsRunning(session.running);

        // External sessions receive their canonical snapshot through the
        // bridge subscription acknowledgement below. Avoid a duplicate GET.
        if (syncPersistedHistory) return;

        const persisted = await manager.loadPersistedHistory(session.storedId).catch(() => null);
        if (!persisted) return;
        if (cancelled) return;
        session.messages = persisted;
        persistedHistoryVersion.current = historyVersion(persisted);
        setMessages(historyToMessages(persisted));
      })
      .catch((error) => {
        if (cancelled) return;
        if (isMissingSessionError(error)) {
          activeStoredId.current = undefined;
          setMessages([]);
          setIsRunning(false);
          window.history.replaceState(null, "", baseWithAgent);
          return;
        }
        toast.error("Session Hermes inaccessible", { description: String(error) });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [baseWithAgent, manager, remoteId, syncPersistedHistory]);

  useEffect(() => {
    if (!remoteId || !syncPersistedHistory) return;
    let cancelled = false;

    const refresh = async () => {
      if (cancelled || isRunningRef.current || document.visibilityState === "hidden") return;
      try {
        const persisted = await manager.loadPersistedHistory(remoteId);
        if (cancelled || isRunningRef.current) return;
        const version = historyVersion(persisted);
        if (version === persistedHistoryVersion.current) return;
        persistedHistoryVersion.current = version;
        setMessages(historyToMessages(persisted));
      } catch {
        // The RPC stream remains usable; focus/reconnect or a later invalidation retries.
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const unsubscribe = manager.subscribePersistedHistory(remoteId, (event) => {
      if (shouldInvalidateSessionMetrics(event)) {
        useSessionMetricsStore.getState().invalidate(remoteId);
      }
      void refresh();
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [manager, remoteId, syncPersistedHistory]);

  useEffect(() => {
    if (!remoteId) return;
    return manager.subscribe(remoteId, (event) => {
      const payload = event.params.payload;
      const text = typeof payload?.text === "string" ? payload.text : "";
      switch (event.params.type) {
        case E.reasoningDelta:
          setIsRunning(true);
          setMessages((current) => appendAssistantReasoning(current, text));
          break;
        case E.reasoningAvailable:
          // Fallback when the model emits a full reasoning blob without deltas.
          setIsRunning(true);
          setMessages((current) => setAssistantReasoningIfEmpty(current, text));
          break;
        case E.thinkingDelta:
          // Hermes status stream (kaomoji, "pondering…") — not real reasoning.
          // Matches desktop: ignore content, keep the run indicator alive.
          setIsRunning(true);
          setMessages((current) => ensureRunningAssistant(current));
          break;
        case E.messageStart:
          setIsRunning(true);
          setMessages((current) => ensureRunningAssistant(current));
          break;
        case E.messageDelta:
          setIsRunning(true);
          setMessages((current) => appendAssistantText(current, text, false));
          break;
        case E.messageComplete:
          setIsRunning(false);
          onApprovalRequest?.(null);
          setMessages((current) => appendAssistantText(current, text, true));
          break;
        case E.error: {
          setIsRunning(false);
          onApprovalRequest?.(null);
          const message = typeof payload?.message === "string" ? payload.message : "Erreur Hermes";
          setMessages((current) => appendAssistantText(current, `\n\nErreur Hermes : ${message}`, true));
          break;
        }
        case E.toolStart: {
          const name = typeof payload?.name === "string" ? payload.name : "outil";
          const toolId = typeof payload?.tool_id === "string" ? payload.tool_id : undefined;
          const argsText = toolArgsTextFromPayload(payload ?? undefined);
          const args = toolArgsFromPayload(payload ?? undefined);
          setIsRunning(true);
          setMessages((current) => appendAssistantToolStart(current, name, toolId, {
            argsText,
            args,
          }));
          break;
        }
        case E.toolProgress: {
          const toolId = typeof payload?.tool_id === "string" ? payload.tool_id : undefined;
          const preview = typeof payload?.preview === "string" ? payload.preview : "";
          if (!preview) break;
          setIsRunning(true);
          setMessages((current) => updateAssistantTool(current, toolId, { preview }));
          break;
        }
        case E.toolComplete: {
          const toolId = typeof payload?.tool_id === "string" ? payload.tool_id : undefined;
          const result = coerceToolResultText(payload ?? undefined);
          const argsText = toolArgsTextFromPayload(payload ?? undefined);
          const args = toolArgsFromPayload(payload ?? undefined);
          onApprovalRequest?.(null);
          setMessages((current) => updateAssistantTool(
            current,
            toolId,
            {
              result: result ?? "Terminé",
              ...(argsText ? { argsText } : {}),
              ...(args ? { args } : {}),
            },
          ));
          break;
        }
        case E.approvalRequest: {
          if (!remoteId) break;
          setIsRunning(true);
          onApprovalRequest?.({
            sessionId: remoteId,
            command: typeof payload?.command === "string" ? payload.command : "",
            description: typeof payload?.description === "string"
              ? payload.description
              : "Commande dangereuse / exécution de code",
            allowPermanent: payload?.allow_permanent !== false,
          });
          break;
        }
        default:
          break;
      }
    });
  }, [manager, onApprovalRequest, remoteId]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = textFromContent(message);
    const attachments = [...(message.attachments ?? [])];
    if (!text && attachments.length === 0) return;
    const agentPrompt = parseAgentCreateCommand(text);
    if (agentPrompt !== null) {
      if (attachments.length > 0) {
        toast.error("Création d’agent", {
          description: "Cette commande n’accepte pas de pièce jointe.",
        });
        return;
      }
      if (!agentPrompt) {
        toast.error("Prompt requis", {
          description: "Utilisez /agent-create :décrivez la mission du nouvel agent.",
        });
        return;
      }

      setIsRunning(true);
      const toastId = toast.loading("Création du profil Hermes…");
      try {
        const response = await fetch(agentsEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(agentCreatePayload(agentPrompt)),
        });
        const result = await response.json().catch(() => null) as {
          agent?: { name?: string };
          error?: string;
          redirectTo?: string;
        } | null;
        if (!response.ok) {
          throw new Error(result?.error ?? `Agents API ${response.status}`);
        }
        if (!result?.redirectTo) {
          throw new Error("La Console n’a pas retourné le chat du nouvel agent.");
        }
        setIsRunning(false);
        toast.success("Agent créé", {
          id: toastId,
          description: result.agent?.name
            ? `${result.agent.name} est prêt.`
            : "Le profil Hermes est prêt.",
        });
        router.push(result.redirectTo);
        router.refresh();
      } catch (error) {
        setIsRunning(false);
        toast.error("Création impossible", {
          id: toastId,
          description: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    startedLocally.current = true;
    const visibleText = text || "Pièces jointes";
    setMessages((current) => [
      ...current,
      userMessage(`hermes-user-${crypto.randomUUID()}`, visibleText, attachments),
    ]);
    setIsRunning(true);
    try {
      const session = await manager.ensure(threadId, remoteId);
      activeStoredId.current = session.storedId;
      const refs = await manager.uploadAttachments(session, attachments);
      const upstreamText = [text, ...refs].filter(Boolean).join("\n") || "Analyse les pièces jointes.";
      await manager.submit(session, upstreamText);
    } catch (error) {
      setIsRunning(false);
      setMessages((current) => appendAssistantText(current, `Erreur Hermes : ${String(error)}`, true));
    }
  }, [agentsEndpoint, manager, remoteId, router, threadId]);

  const onReload = useCallback(async (parentId: string | null) => {
    if (parentId == null) return;
    const trimmed = prepareMessagesForReload(messagesRef.current, parentId);
    const sourceUser = [...trimmed].reverse().find((message) => message.role === "user");
    const text = sourceUser ? textFromThreadUserMessage(sourceUser) : "";
    if (!text) return;

    startedLocally.current = true;
    setMessages(trimmed);
    setIsRunning(true);
    try {
      const session = await manager.ensure(threadId, remoteId);
      activeStoredId.current = session.storedId;
      await manager.submit(session, text);
    } catch (error) {
      setIsRunning(false);
      setMessages((current) => appendAssistantText(current, `Erreur Hermes : ${String(error)}`, true));
    }
  }, [manager, remoteId, threadId]);

  const onEdit = useCallback(async (message: AppendMessage) => {
    const text = textFromContent(message);
    const attachments = [...(message.attachments ?? [])];
    if (!text && attachments.length === 0) return;
    const editedMessageId = message.sourceId ?? message.parentId;
    if (!editedMessageId) return;

    const trimmed = prepareMessagesForEdit(messagesRef.current, editedMessageId);
    const visibleText = text || "Pièces jointes";
    startedLocally.current = true;
    setMessages([
      ...trimmed,
      userMessage(`hermes-user-${crypto.randomUUID()}`, visibleText, attachments),
    ]);
    setIsRunning(true);
    try {
      const session = await manager.ensure(threadId, remoteId);
      activeStoredId.current = session.storedId;
      const refs = await manager.uploadAttachments(session, attachments);
      const upstreamText = [text, ...refs].filter(Boolean).join("\n") || "Analyse les pièces jointes.";
      await manager.submit(session, upstreamText);
    } catch (error) {
      setIsRunning(false);
      setMessages((current) => appendAssistantText(current, `Erreur Hermes : ${String(error)}`, true));
    }
  }, [manager, remoteId, threadId]);

  return useExternalStoreRuntime({
    messages,
    isLoading,
    isRunning,
    onNew,
    onEdit,
    onReload,
    onCancel: async () => {
      if (activeStoredId.current) await manager.cancel(activeStoredId.current);
      setIsRunning(false);
    },
    adapters: {
      attachments: hermesAttachmentAdapter,
      dictation,
    },
  });
}

function createHermesThreadListAdapter(manager: HermesSessionManager): RemoteThreadListAdapter {
  const list = async () => {
    const rows = await manager.list();
    const mapRow = (row: SessionListRow) => ({
      remoteId: row.id,
      externalId: row.id,
      status: row.archived ? "archived" as const : "regular" as const,
      title: row.title || undefined,
      lastMessageAt: dateFromHermes(row.lastActiveAt),
      custom: row.source ? { source: row.source } : undefined,
    });
    return {
      threads: rows.map(mapRow),
    };
  };

  return {
    list,
    initialize: async (threadId) => {
      const session = await manager.create(threadId);
      return { remoteId: session.storedId, externalId: session.storedId };
    },
    fetch: async (remoteId) => {
      const rows = await manager.list();
      const row = rows.find((item) => item.id === remoteId);
      if (!row) throw new Error("Session Hermes introuvable");
      return {
        remoteId: row.id,
        externalId: row.id,
        status: row.archived ? "archived" : "regular",
        title: row.title || undefined,
        lastMessageAt: dateFromHermes(row.lastActiveAt),
        custom: row.source ? { source: row.source } : undefined,
      };
    },
    rename: async (remoteId, title) => manager.rename(remoteId, title),
    updateCustom: async () => {},
    archive: async (remoteId) => manager.archive(remoteId, true),
    unarchive: async (remoteId) => manager.archive(remoteId, false),
    delete: async (remoteId) => {
      await manager.delete(remoteId);
      toast.success("Session supprimée");
    },
    generateTitle: async (remoteId, messages) => {
      const title = buildTitle(messages);
      await manager.rename(remoteId, title);
      return createAssistantStream((controller) => controller.appendText(title));
    },
  };
}

export function useHermesChatRuntime({
  active,
  threadId,
  sessionsEndpoint,
  inferenceEndpoint,
  agentsEndpoint,
}: {
  active: boolean;
  threadId?: string;
  sessionsEndpoint: string;
  inferenceEndpoint: string;
  agentsEndpoint: string;
}) {
  const client = useHermes();
  const [composerState, setComposerState] = useState({
    ready: false,
    models: [] as HermesComposerModel[],
    provider: "",
    model: "",
    effort: "high" as HermesEffort,
    reasoningSupported: false,
    fast: false,
    permission: "smart" as HermesPermission,
    planMode: false,
    webSearch: false,
    webSearchAvailable: false,
    pendingApproval: null as HermesApprovalRequest | null,
    info: undefined as SessionInfo | undefined,
  });
  const preferencesRef = useRef<ComposerPreferences>({
    provider: "",
    model: "",
    effort: "high",
    reasoningSupported: false,
    fast: false,
    permission: "smart",
    planMode: false,
    webSearch: false,
  });
  const defaultInferenceRef = useRef<DefaultInferencePreferences>({
    provider: "",
    model: "",
    effort: "high",
    reasoningSupported: false,
  });
  const modelsRef = useRef<HermesComposerModel[]>([]);
  const updatePreferences = useCallback((patch: Partial<ComposerPreferences>) => {
    preferencesRef.current = { ...preferencesRef.current, ...patch };
    setComposerState((current) => ({ ...current, ...patch }));
  }, []);
  const handleInfo = useCallback((storedId: string, info: SessionInfo) => {
    useSessionMetricsStore.getState().publishInfo(storedId, info);
    const provider = info.provider ?? preferencesRef.current.provider;
    const model = info.model ?? preferencesRef.current.model;
    const reportedEffort = info.reasoning_effort
      && isReasoningControlId(info.reasoning_effort)
      ? info.reasoning_effort
      : preferencesRef.current.effort;
    const reasoning = resolveComposerReasoning(
      modelsRef.current,
      provider,
      model,
      reportedEffort,
    );
    const patch: Partial<ComposerPreferences> = {
      provider,
      model,
      ...reasoning,
      ...(typeof info.fast === "boolean" ? { fast: info.fast } : {}),
      ...(info.yolo ? { permission: "bypass" as const } : info.approval_mode
        ? { permission: info.approval_mode === "manual" ? "manual" as const : "smart" as const }
        : {}),
    };
    preferencesRef.current = { ...preferencesRef.current, ...patch };
    setComposerState((current) => ({ ...current, ...patch, info }));
  }, []);
  const handleContextBreakdown = useCallback((storedId: string, breakdown: SessionContextBreakdown) => {
    useSessionMetricsStore.getState().publishContextBreakdown(storedId, breakdown);
  }, []);
  const manager = useMemo(
    () => new HermesSessionManager(
      client,
      sessionsEndpoint,
      () => preferencesRef.current,
      handleInfo,
      handleContextBreakdown,
    ),
    [client, sessionsEndpoint, handleContextBreakdown, handleInfo],
  );
  useEffect(() => manager.start(), [manager]);
  const adapter = useMemo(() => createHermesThreadListAdapter(manager), [manager]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void client.waitUntilOpen().then(async () => {
      const [options, tools, liveTools, inference] = await Promise.all([
        client.modelOptions(),
        client.toolsList(),
        client.toolsShow().catch(() => ({ sections: [] as Array<{ name: string; tools?: Array<{ name: string }> }> })),
        fetch(inferenceEndpoint, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error(`Inference API ${response.status}`);
            return response.json() as Promise<{
              currentProvider?: string;
              currentModel?: string;
              currentReasoningEffort?: HermesEffort;
              providers?: Array<{
                id: string;
                name?: string;
                models?: string[];
                authenticated?: boolean;
                capabilities?: HermesModelOption["capabilities"];
              }>;
            }>;
          })
          .catch(() => ({}) as {
            currentProvider?: string;
            currentModel?: string;
            currentReasoningEffort?: HermesEffort;
            providers?: Array<{
              id: string;
              name?: string;
              models?: string[];
              authenticated?: boolean;
              capabilities?: HermesModelOption["capabilities"];
            }>;
          }),
      ]);
      if (cancelled) return;
      const inferenceModels = flattenModels((inference.providers ?? []).map((provider) => ({
        slug: provider.id,
        name: provider.name,
        models: provider.models,
        authenticated: provider.authenticated,
        capabilities: provider.capabilities,
      })));
      const models = mergeComposerModels(inferenceModels, flattenModels(options.providers));
      modelsRef.current = models;
      const provider = inference.currentProvider ?? options.provider ?? models[0]?.provider ?? "";
      const model = inference.currentModel ?? options.model ?? models.find((item) => item.provider === provider)?.model ?? "";
      // Prefer tools.show (passes check_fn — e.g. Firecrawl key). Fall back to
      // tools.list toolset flags when show is unavailable.
      const liveToolNames = new Set(
        (liveTools.sections ?? []).flatMap((section) =>
          (section.tools ?? []).map((tool) => tool.name),
        ),
      );
      const webSearchAvailable = liveToolNames.size > 0
        ? liveToolNames.has("web_search")
        : (tools.toolsets ?? []).some((toolset) =>
          toolset.enabled !== false && (
            toolset.name === "web"
            || toolset.tools?.includes("web_search")
          ),
        );
      const defaultInference = {
        provider,
        model,
        ...resolveComposerReasoning(
          models,
          provider,
          model,
          inference.currentReasoningEffort ?? preferencesRef.current.effort,
        ),
      } satisfies DefaultInferencePreferences;
      defaultInferenceRef.current = defaultInference;
      updatePreferences({
        ...defaultInference,
        ...(webSearchAvailable ? {} : { webSearch: false }),
      });
      setComposerState((current) => ({
        ...current,
        ready: true,
        models,
        webSearchAvailable,
        ...(webSearchAvailable ? {} : { webSearch: false }),
      }));
    }).catch((error) => {
      if (!cancelled) {
        setComposerState((current) => ({ ...current, ready: true }));
        toast.error("Options Hermes indisponibles", { description: String(error) });
      }
    });
    return () => { cancelled = true; };
  }, [active, client, inferenceEndpoint, updatePreferences]);

  useEffect(() => {
    if (threadId) return;
    const defaultInference = defaultInferenceRef.current;
    if (!defaultInference.provider && !defaultInference.model) return;
    updatePreferences(defaultInference);
  }, [threadId, updatePreferences]);

  const handleApprovalRequest = useCallback((request: HermesApprovalRequest | null) => {
    setComposerState((current) => (
      current.pendingApproval === request
        ? current
        : { ...current, pendingApproval: request }
    ));
  }, []);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: function useHermesRuntimeHook() {
      return useHermesThreadRuntime(manager, agentsEndpoint, handleApprovalRequest);
    },
    adapter,
    threadId,
  });

  const composer = useMemo<HermesComposerController>(() => ({
    ...composerState,
    async setModel(_remoteId, model) {
      const provider = preferencesRef.current.provider;
      const selected = modelsRef.current.find(
        (item) => item.provider === provider && item.model === model,
      );
      if (!selected) {
        throw new Error("Ce modèle n’appartient pas au fournisseur actif.");
      }
      const reasoning = resolveComposerReasoning(
        modelsRef.current,
        provider,
        model,
        preferencesRef.current.effort,
      );
      const previous = {
        provider: preferencesRef.current.provider,
        model: preferencesRef.current.model,
        effort: preferencesRef.current.effort,
        reasoningSupported: preferencesRef.current.reasoningSupported,
      };
      updatePreferences({ provider, model, ...reasoning });

      let response: Response;
      try {
        response = await fetch(inferenceEndpoint, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "model",
            provider,
            model,
            ...(reasoning.reasoningSupported
              ? { reasoningEffort: reasoning.effort }
              : {}),
          }),
        });
      } catch (error) {
        updatePreferences(previous);
        throw error;
      }

      if (!response.ok) {
        updatePreferences(previous);
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Inference API ${response.status}`);
      }

      defaultInferenceRef.current = {
        ...defaultInferenceRef.current,
        provider,
        model,
        ...reasoning,
      };

      // Match Settings → Models exactly: selecting a model persists the
      // profile default through the inference endpoint. Do not issue a second
      // session-scoped config.set, which would re-resolve OAuth credentials in
      // the live TUI session and can reject an otherwise authenticated provider.
      toast.success("Modèle enregistré", {
        description: `${model} sera utilisé par les prochaines sessions de cet agent.`,
      });
    },
    async setEffort(remoteId, effort) {
      const selected = modelsRef.current.find(
        (item) => item.provider === preferencesRef.current.provider
          && item.model === preferencesRef.current.model,
      );
      const config = getReasoningControlConfig(
        preferencesRef.current.provider,
        preferencesRef.current.model,
        selected?.supportsReasoning ?? true,
      );
      if (!config?.options.some((option) => option.id === effort)) {
        throw new Error("Cet effort n’est pas disponible pour le modèle actif.");
      }
      const response = await fetch(inferenceEndpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "reasoning", reasoningEffort: effort }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Inference API ${response.status}`);
      }
      updatePreferences({ effort, reasoningSupported: true });
      defaultInferenceRef.current = {
        ...defaultInferenceRef.current,
        effort,
        reasoningSupported: true,
      };
      await manager.configure(remoteId, "reasoning", effort);
    },
    async setFast(remoteId, fast) {
      updatePreferences({ fast });
      await manager.configure(remoteId, "fast", fast ? "fast" : "normal");
    },
    async setPermission(remoteId, permission) {
      updatePreferences({ permission });
      if (permission === "bypass") {
        await manager.configure(remoteId, "yolo", "on", "session");
        return;
      }
      await manager.configure(remoteId, "yolo", "off", "session");
      await manager.configure(remoteId, "approval_mode", permission);
    },
    setPlanMode(planMode) {
      updatePreferences({ planMode });
    },
    setWebSearch(webSearch) {
      updatePreferences({ webSearch });
    },
    async respondApproval(choice: ApprovalChoice) {
      const pending = composerState.pendingApproval;
      if (!pending) return;
      try {
        await client.approvalRespondAsync(pending.sessionId, choice);
        setComposerState((current) => ({ ...current, pendingApproval: null }));
      } catch (error) {
        toast.error("Approbation", { description: String(error) });
        throw error;
      }
    },
    async completePath(query) {
      return completionRows(await client.completePath(query, composerState.info?.cwd));
    },
    async completeSlash(query) {
      const normalized = query.replace(/^\//, "").trim().toLowerCase();
      const local = "agent-create".startsWith(normalized)
        ? [{
            id: "agent-create",
            label: AGENT_CREATE_COMMAND,
            value: AGENT_CREATE_COMMAND,
            description: "Créer un agent : /agent-create :mission",
          }]
        : [];
      const remote = await client.completeSlash(query)
        .then(completionRows)
        .catch((error) => {
          if (local.length > 0) return [];
          throw error;
        });
      return [
        ...local,
        ...remote.filter((item) => item.label.replace(/^\//, "") !== "agent-create"),
      ];
    },
    async handoffTelegram(activeThreadId, remoteId, onProgress) {
      await manager.handoff(activeThreadId, remoteId, "telegram", onProgress);
    },
  }), [client, composerState, inferenceEndpoint, manager, updatePreferences]);

  return { runtime, composer };
}
