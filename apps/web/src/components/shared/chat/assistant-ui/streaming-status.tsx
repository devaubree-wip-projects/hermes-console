"use client";

import { useAuiState } from "@assistant-ui/react";
import { Spinner } from "@/components/ui/spinner";
import { chatCopy } from "@/components/shared/chat/constants/chat-copy";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/shared/chat/ui/marker";

type StreamingPhase = "thinking" | "tools" | "writing" | "working";

function resolvePhase(parts: Array<{ type?: string; status?: { type?: string }; text?: string; result?: unknown }>): StreamingPhase | null {
  const last = parts.at(-1);
  if (!last) return "thinking";

  if (last.type === "tool-call" || last.type === "standalone-tool-call") {
    if (last.status?.type === "running" || last.result === undefined) return "tools";
  }

  if (last.type === "reasoning") {
    const text = typeof last.text === "string" ? last.text : "";
    if (!text.trim()) return "thinking";
    return "thinking";
  }

  if (last.type === "text") {
    const text = typeof last.text === "string" ? last.text : "";
    if (text.trim()) return "writing";
    return "thinking";
  }

  const hasRunningTool = parts.some(
    (part) =>
      (part.type === "tool-call" || part.type === "standalone-tool-call")
      && (part.status?.type === "running" || part.result === undefined),
  );
  if (hasRunningTool) return "tools";

  const hasReasoning = parts.some(
    (part) => part.type === "reasoning" && typeof part.text === "string" && part.text.trim(),
  );
  if (hasReasoning) return "thinking";

  return "working";
}

const PHASE_COPY: Record<StreamingPhase, string> = {
  thinking: chatCopy.streamingThinking,
  tools: chatCopy.streamingTools,
  writing: chatCopy.streamingWriting,
  working: chatCopy.streamingWorking,
};

export function StreamingStatus() {
  const phase = useAuiState((s) => {
    if (s.message.status?.type !== "running") return null;
    const hasVisibleText = s.message.parts.some(
      (part) =>
        part.type === "text"
        && "text" in part
        && typeof part.text === "string"
        && part.text.length > 0,
    );
    if (hasVisibleText) return null;
    const hasReasoning = s.message.parts.some(
      (part) =>
        part.type === "reasoning"
        && "text" in part
        && typeof part.text === "string"
        && part.text.length > 0,
    );
    if (hasReasoning) return null;
    return resolvePhase(s.message.parts as Array<{ type?: string; status?: { type?: string }; text?: string; result?: unknown }>);
  });

  if (!phase) return null;

  return (
    <Marker
      role="status"
      data-slot="aui-streaming-status"
      className="mb-2"
    >
      <MarkerIcon>
        <Spinner className="size-3.5" />
      </MarkerIcon>
      <MarkerContent className="shimmer text-xs">
        {PHASE_COPY[phase]}
      </MarkerContent>
    </Marker>
  );
}
