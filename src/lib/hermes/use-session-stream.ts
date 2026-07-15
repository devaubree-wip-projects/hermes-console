"use client";

import { useEffect, useReducer } from "react";
import { E, type AgentEvent, type JsonObject } from "@/lib/hermes/protocol";
import { useHermes } from "@/lib/hermes/client";

export type TranscriptItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean; status?: string }
  | { kind: "reasoning"; id: string; text: string; streaming: boolean }
  | { kind: "tool"; id: string; toolId?: string; name: string; state: "running" | "done" | "error"; preview?: string; result?: string }
  | { kind: "subagent"; id: string; goal?: string; state: "running" | "done"; text?: string }
  | { kind: "error"; id: string; message: string };

export type Interaction =
  | { kind: "approval"; id: string; command: string; description?: string; allowPermanent: boolean }
  | { kind: "clarify"; id: string; requestId: string; question: string; choices?: string[] }
  | { kind: "sudo"; id: string; requestId: string }
  | { kind: "secret"; id: string; requestId: string; prompt?: string; envVar?: string };

interface State {
  items: TranscriptItem[];
  interactions: Interaction[];
  status: string | null;
  working: boolean;
}

type Action =
  | { t: "event"; ev: AgentEvent }
  | { t: "user"; text: string }
  | { t: "resolveInteraction"; id: string }
  | { t: "history"; items: TranscriptItem[] }
  | { t: "reset" };

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

function str(p: JsonObject | undefined, k: string): string | undefined {
  const v = p?.[k];
  return typeof v === "string" ? v : undefined;
}

function lastStreaming(items: TranscriptItem[], kind: "assistant" | "reasoning"): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === kind && it.streaming) return i;
  }
  return -1;
}

function closeReasoning(items: TranscriptItem[]): TranscriptItem[] {
  const i = lastStreaming(items, "reasoning");
  if (i < 0) return items;
  const next = items.slice();
  next[i] = { ...(next[i] as Extract<TranscriptItem, { kind: "reasoning" }>), streaming: false };
  return next;
}

function reduce(state: State, action: Action): State {
  switch (action.t) {
    case "reset":
      return { items: [], interactions: [], status: null, working: false };
    case "history":
      return { ...state, items: action.items };
    case "user":
      return {
        ...state,
        working: true,
        status: null,
        items: [...state.items, { kind: "user", id: uid("u"), text: action.text }],
      };
    case "resolveInteraction":
      return { ...state, interactions: state.interactions.filter((x) => x.id !== action.id) };
    case "event":
      return applyEvent(state, action.ev);
    default:
      return state;
  }
}

function applyEvent(state: State, ev: AgentEvent): State {
  const type = ev.params.type;
  const p = ev.params.payload;

  switch (type) {
    case E.messageStart: {
      const items = closeReasoning(state.items);
      return {
        ...state,
        working: true,
        status: null,
        items: [...items, { kind: "assistant", id: uid("a"), text: "", streaming: true }],
      };
    }
    case E.messageDelta: {
      const items = state.items.slice();
      let i = lastStreaming(items, "assistant");
      if (i < 0) {
        items.push({ kind: "assistant", id: uid("a"), text: "", streaming: true });
        i = items.length - 1;
      }
      const cur = items[i] as Extract<TranscriptItem, { kind: "assistant" }>;
      items[i] = { ...cur, text: cur.text + (str(p, "text") ?? "") };
      return { ...state, working: true, items };
    }
    case E.messageComplete: {
      const items = closeReasoning(state.items).slice();
      const i = lastStreaming(items, "assistant");
      const finalText = str(p, "text");
      const status = str(p, "status");
      if (i >= 0) {
        const cur = items[i] as Extract<TranscriptItem, { kind: "assistant" }>;
        items[i] = { ...cur, text: finalText ?? cur.text, streaming: false, status };
      } else if (finalText) {
        items.push({ kind: "assistant", id: uid("a"), text: finalText, streaming: false, status });
      }
      return { ...state, items, working: false, status: null };
    }
    case E.reasoningDelta:
    case E.thinkingDelta: {
      const items = state.items.slice();
      let i = lastStreaming(items, "reasoning");
      if (i < 0) {
        items.push({ kind: "reasoning", id: uid("r"), text: "", streaming: true });
        i = items.length - 1;
      }
      const cur = items[i] as Extract<TranscriptItem, { kind: "reasoning" }>;
      items[i] = { ...cur, text: cur.text + (str(p, "text") ?? "") };
      return { ...state, working: true, items };
    }
    case E.statusUpdate:
      return { ...state, working: true, status: str(p, "text") ?? null };
    case E.error:
      return {
        ...state,
        working: false,
        status: null,
        items: [...state.items, { kind: "error", id: uid("e"), message: str(p, "message") ?? "Erreur inconnue" }],
      };
    case E.toolStart:
      return {
        ...state,
        working: true,
        items: [
          ...state.items,
          { kind: "tool", id: uid("t"), toolId: str(p, "tool_id"), name: str(p, "name") ?? "outil", state: "running" },
        ],
      };
    case E.toolProgress: {
      const items = state.items.slice();
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.kind === "tool" && it.state === "running") {
          items[i] = { ...it, preview: str(p, "preview") ?? it.preview };
          break;
        }
      }
      return { ...state, items };
    }
    case E.toolComplete: {
      const items = state.items.slice();
      const toolId = str(p, "tool_id");
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.kind === "tool" && it.state === "running" && (!toolId || it.toolId === toolId)) {
          items[i] = {
            ...it,
            state: "done",
            result: str(p, "summary") ?? str(p, "result_text") ?? str(p, "result"),
          };
          break;
        }
      }
      return { ...state, items };
    }
    case E.subagentStart:
      return {
        ...state,
        items: [...state.items, { kind: "subagent", id: uid("s"), goal: str(p, "goal"), state: "running" }],
      };
    case E.subagentComplete: {
      const items = state.items.slice();
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.kind === "subagent" && it.state === "running") {
          items[i] = { ...it, state: "done", text: str(p, "summary") ?? str(p, "text") };
          break;
        }
      }
      return { ...state, items };
    }
    case E.approvalRequest:
      return {
        ...state,
        interactions: [
          ...state.interactions,
          {
            kind: "approval",
            id: uid("i"),
            command: str(p, "command") ?? "(commande masquée)",
            description: str(p, "description"),
            allowPermanent: p?.allow_permanent !== false,
          },
        ],
      };
    case E.clarifyRequest: {
      const rid = str(p, "request_id");
      if (!rid) return state;
      const choices = Array.isArray(p?.choices) ? (p!.choices as unknown[]).map(String) : undefined;
      return {
        ...state,
        interactions: [
          ...state.interactions,
          { kind: "clarify", id: uid("i"), requestId: rid, question: str(p, "question") ?? "Précision demandée", choices },
        ],
      };
    }
    case E.sudoRequest: {
      const rid = str(p, "request_id");
      if (!rid) return state;
      return { ...state, interactions: [...state.interactions, { kind: "sudo", id: uid("i"), requestId: rid }] };
    }
    case E.secretRequest: {
      const rid = str(p, "request_id");
      if (!rid) return state;
      return {
        ...state,
        interactions: [
          ...state.interactions,
          { kind: "secret", id: uid("i"), requestId: rid, prompt: str(p, "prompt"), envVar: str(p, "env_var") },
        ],
      };
    }
    default:
      return state;
  }
}

const INITIAL: State = { items: [], interactions: [], status: null, working: false };

/**
 * Subscribes to agent events for `liveSessionId` and folds them into a transcript
 * + pending interaction queue. Events without a session_id (or matching this one)
 * are applied; events for other sessions are ignored.
 */
export function useSessionStream(liveSessionId: string | null) {
  const client = useHermes();
  const [state, dispatch] = useReducer(reduce, INITIAL);

  useEffect(() => {
    if (!liveSessionId) return;
    return client.onEvent((ev) => {
      const sid = ev.params.session_id;
      if (sid && sid !== liveSessionId) return;
      dispatch({ t: "event", ev });
    });
  }, [client, liveSessionId]);

  return {
    ...state,
    addUser: (text: string) => dispatch({ t: "user", text }),
    resolveInteraction: (id: string) => dispatch({ t: "resolveInteraction", id }),
    loadHistory: (items: TranscriptItem[]) => dispatch({ t: "history", items }),
    reset: () => dispatch({ t: "reset" }),
  };
}
