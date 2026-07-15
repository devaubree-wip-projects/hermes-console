"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useHermesChatRuntime } from "@/components/shared/chat/runtime/hermes-chat-runtime";
import { HermesComposerProvider } from "@/components/shared/chat/runtime/hermes-composer-context";

export function ChatRuntimeProvider({
  children,
  threadId,
  sessionsEndpoint,
  inferenceEndpoint,
  agentsEndpoint,
}: {
  children: React.ReactNode;
  threadId?: string;
  sessionsEndpoint: string;
  inferenceEndpoint: string;
  agentsEndpoint: string;
}) {
  const { runtime, composer } = useHermesChatRuntime({
    threadId,
    sessionsEndpoint,
    inferenceEndpoint,
    agentsEndpoint,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <HermesComposerProvider value={composer}>
        {children}
      </HermesComposerProvider>
    </AssistantRuntimeProvider>
  );
}
