"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseSseDelta } from "@/lib/hermes";
import type { WorkspacePermissions } from "@/lib/permissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ContextPanel } from "@/components/chat/context-panel";
import { MessageList, type ChatMessageItem } from "@/components/chat/message-list";

export type ChatViewContext = {
  workspaceName: string;
  memoryCount: number;
  fileNames: string[];
  permissions: WorkspacePermissions;
};

export function ChatView({
  workspaceId,
  sessionId,
  initialMessages,
  context,
}: {
  workspaceId: string;
  sessionId: string;
  initialMessages: ChatMessageItem[];
  context: ChatViewContext;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retry (re-POST with only sessionId) only succeeds when nothing streamed —
  // otherwise the server persisted the assistant reply and returns "Rien à relancer".
  const [canRetry, setCanRetry] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autostartTriggered = useRef(false);

  const runStream = useCallback(
    async (content?: string) => {
      setError(null);
      setCanRetry(false);
      setStreaming(true);
      setStreamingText("");

      if (content) {
        setMessages((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() },
        ]);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let buffer = "";
      let text = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content ? { sessionId, content } : { sessionId }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? "Une erreur est survenue. Réessayez.");
          setCanRetry(true); // nothing streamed yet — a retry can succeed
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const delta = parseSseDelta(line);
            if (delta) {
              text += delta;
              setStreamingText(text);
            }
          }
        }

        setMessages((prev) => [
          ...prev,
          { id: `assistant-${Date.now()}`, role: "assistant", content: text, createdAt: new Date().toISOString() },
        ]);
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (text) {
          // Partial reply already streamed and was persisted server-side: keep it
          // instead of dropping it, and don't offer a retry that would 400.
          setMessages((prev) => [
            ...prev,
            { id: `assistant-${Date.now()}`, role: "assistant", content: text, createdAt: new Date().toISOString() },
          ]);
          if (!aborted) {
            setError("La connexion a été interrompue. La réponse est peut-être incomplète.");
          }
        } else if (!aborted) {
          setError("La connexion a été interrompue. Réessayez.");
          setCanRetry(true);
        }
      } finally {
        setStreaming(false);
        setStreamingText(null);
        abortRef.current = null;
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (autostartTriggered.current) return;
    if (searchParams.get("autostart") !== "1") return;
    autostartTriggered.current = true;

    const last = messages[messages.length - 1];
    // Defer the stream kick-off out of the synchronous effect body so the
    // first paint happens before state starts updating.
    const timer = setTimeout(() => {
      if (last && last.role === "user") {
        void runStream();
      }
      router.replace(`/w/${workspaceId}/chat/${sessionId}`, { scroll: false });
    }, 0);
    return () => {
      // StrictMode-safe: if the pending kick-off is cancelled, allow the
      // effect re-run to schedule it again.
      clearTimeout(timer);
      autostartTriggered.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSend(content: string) {
    void runStream(content);
  }

  // Abort any in-flight stream when the view unmounts (client-navigation mid-stream).
  // The server's cancel() handler persists the partial reply, same as the Stop button.
  useEffect(() => () => abortRef.current?.abort(), []);

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleRetry() {
    void runStream();
  }

  return (
    <div className="flex h-full min-h-0 flex-col xl:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList messages={messages} streamingText={streamingText} streaming={streaming} />

        {error && (
          <div className="px-4 pb-2 md:px-6">
            <div className="mx-auto w-full max-w-3xl">
              <Alert variant="destructive">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{error}</span>
                  {canRetry && (
                    <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
                      Réessayer
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          </div>
        )}

        <div className="border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <ChatComposer onSend={handleSend} onStop={handleStop} streaming={streaming} />
          </div>
        </div>
      </div>

      <ContextPanel
        workspaceId={workspaceId}
        workspaceName={context.workspaceName}
        memoryCount={context.memoryCount}
        fileNames={context.fileNames}
        permissions={context.permissions}
      />
    </div>
  );
}
