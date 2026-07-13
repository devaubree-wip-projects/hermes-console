"use client";

import { useEffect, useRef } from "react";
import { formatDateTime } from "@/lib/format";

export type ChatMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export function MessageList({
  messages,
  streamingText,
  streaming,
}: {
  messages: ChatMessageItem[];
  streamingText: string | null;
  streaming: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Aucun message pour l’instant.
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {streaming && (
          <div className="max-w-[85%]">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {streamingText}
              <span
                className="ml-1 inline-block size-2 animate-pulse rounded-full bg-muted-foreground align-middle"
                aria-hidden="true"
              />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageItem }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{formatDateTime(message.createdAt)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[85%]">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(message.createdAt)}</p>
    </div>
  );
}
