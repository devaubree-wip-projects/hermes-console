"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AgentCreateConfirmation } from "@/components/shared/chat/runtime/agent-create-confirmation";
import { useHermesChatRuntime } from "@/components/shared/chat/runtime/hermes-chat-runtime";
import { HermesComposerProvider } from "@/components/shared/chat/runtime/hermes-composer-context";

export function ChatRuntimeProvider({
  children,
  active,
  threadId,
  sessionsEndpoint,
  inferenceEndpoint,
  agentsEndpoint,
  activeAgentId,
}: {
  children: React.ReactNode;
  active: boolean;
  threadId?: string;
  sessionsEndpoint: string;
  inferenceEndpoint: string;
  agentsEndpoint: string;
  activeAgentId?: string | null;
}) {
  const {
    runtime,
    composer,
    agentCreateConfirmation,
    cancelAgentCreation,
    confirmAgentCreation,
  } = useHermesChatRuntime({
    active,
    threadId,
    sessionsEndpoint,
    inferenceEndpoint,
    agentsEndpoint,
    activeAgentId,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <HermesComposerProvider value={composer}>
        {children}
        <AgentCreateConfirmation
          onCancel={cancelAgentCreation}
          onConfirm={confirmAgentCreation}
          state={agentCreateConfirmation}
        />
      </HermesComposerProvider>
    </AssistantRuntimeProvider>
  );
}
