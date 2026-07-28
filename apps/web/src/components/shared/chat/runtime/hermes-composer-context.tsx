"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  ApprovalChoice,
  HandoffLifecycleState,
  SessionInfo,
} from "@/lib/hermes/protocol";
import type { ReasoningControlId } from "@/components/shared/chat/constants/reasoning-config";
import type { HermesApprovalRequest } from "@/components/shared/chat/assistant-ui/tool-approval-banner";

export type HermesComposerModel = {
  provider: string;
  providerLabel: string;
  model: string;
  supportsFast: boolean;
  supportsReasoning: boolean;
};

export type HermesPermission = "smart" | "manual" | "bypass";
export type HermesEffort = ReasoningControlId;

export type HermesComposerState = {
  ready: boolean;
  models: HermesComposerModel[];
  provider: string;
  model: string;
  effort: HermesEffort;
  reasoningSupported: boolean;
  fast: boolean;
  permission: HermesPermission;
  planMode: boolean;
  webSearch: boolean;
  webSearchAvailable: boolean;
  pendingApproval: HermesApprovalRequest | null;
  info?: SessionInfo;
};

export type HermesCompletion = {
  id: string;
  label: string;
  description?: string;
  value?: string;
};

export type HermesComposerController = HermesComposerState & {
  setModel(remoteId: string | undefined, model: string): Promise<void>;
  setEffort(remoteId: string | undefined, effort: HermesEffort): Promise<void>;
  setFast(remoteId: string | undefined, fast: boolean): Promise<void>;
  setPermission(remoteId: string | undefined, permission: HermesPermission): Promise<void>;
  setPlanMode(value: boolean): void;
  setWebSearch(value: boolean): void;
  respondApproval(choice: ApprovalChoice): Promise<void>;
  completePath(query: string): Promise<HermesCompletion[]>;
  completeSlash(query: string): Promise<HermesCompletion[]>;
  handoffTelegram(
    threadId: string,
    remoteId: string | undefined,
    onProgress?: (state: HandoffLifecycleState) => void,
  ): Promise<void>;
};

const HermesComposerContext = createContext<HermesComposerController | null>(null);

export function HermesComposerProvider({
  value,
  children,
}: {
  value: HermesComposerController;
  children: ReactNode;
}) {
  return (
    <HermesComposerContext.Provider value={value}>
      {children}
    </HermesComposerContext.Provider>
  );
}

export function useHermesComposer() {
  const value = useContext(HermesComposerContext);
  if (!value) throw new Error("useHermesComposer must be used inside HermesComposerProvider");
  return value;
}
