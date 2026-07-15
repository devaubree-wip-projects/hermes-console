"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BotIcon,
  BrainIcon,
  MessageCircleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getReasoningControlConfig } from "@/components/shared/chat/constants/reasoning-config";
import type { SessionMetricsResponse } from "@/lib/hermes/session-metrics";
import { sessionOrigin } from "@/lib/hermes/session-origin";
import { useChatRunStore } from "@/lib/shared/chat/chat-run-store";
import { useSessionMetricsStore } from "@/lib/shared/chat/session-metrics-store";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function sessionIdFromPathname(pathname: string) {
  const match = pathname.match(/\/d\/chat\/c\/([^/]+)$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function modelLabel(model: string | null | undefined) {
  if (!model) return "Modèle indisponible";
  return model.split("/").at(-1)?.replaceAll("-", " ") ?? model;
}

function effortLabel(
  provider: string | null | undefined,
  model: string | null | undefined,
  effort: string | null | undefined,
) {
  if (!effort) return "Effort indisponible";
  if (effort === "none") return "Raisonnement désactivé";
  const option = getReasoningControlConfig(provider ?? "", model ?? "")
    ?.options.find((item) => item.id === effort);
  const label = option?.name
    ?? effort.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
  return `Raisonnement ${label}`;
}

export function SessionUsageCard({
  workspaceBase,
  agentSlug,
}: {
  workspaceBase: string;
  agentSlug?: string;
}) {
  const pathname = usePathname();
  const sessionId = useMemo(() => sessionIdFromPathname(pathname), [pathname]);
  const [snapshot, setSnapshot] = useState<{
    endpoint: string;
    metrics: SessionMetricsResponse | null;
    failed: boolean;
  }>({ endpoint: "", metrics: null, failed: false });
  const hasRunningChat = useChatRunStore((state) => state.runningThreadIds.length > 0);
  const live = useSessionMetricsStore((state) => (
    sessionId ? state.sessions[sessionId] : undefined
  ));
  const invalidationVersion = useSessionMetricsStore((state) => (
    sessionId ? state.invalidations[sessionId] ?? 0 : 0
  ));
  const endpoint = sessionId && agentSlug
    ? `/api${workspaceBase}/agents/${encodeURIComponent(agentSlug)}/sessions/${encodeURIComponent(sessionId)}/metrics`
    : null;
  const metrics = endpoint && snapshot.endpoint === endpoint ? snapshot.metrics : null;
  const failed = endpoint && snapshot.endpoint === endpoint ? snapshot.failed : false;
  const refreshInFlight = useRef<{
    endpoint: string;
    promise: Promise<void>;
  } | null>(null);
  const lastInvalidation = useRef<{
    endpoint: string | null;
    version: number;
  } | null>(null);
  const wasRunning = useRef(hasRunningChat);

  const refresh = useCallback((signal?: AbortSignal) => {
    if (!endpoint) return Promise.resolve();
    const active = refreshInFlight.current;
    if (active?.endpoint === endpoint) return active.promise;

    const promise = (async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal });
        if (!response.ok) throw new Error(`Session metrics ${response.status}`);
        const next = await response.json() as SessionMetricsResponse;
        useSessionMetricsStore.getState().publishPersisted(next);
        setSnapshot({ endpoint, metrics: next, failed: false });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSnapshot((current) => ({
          endpoint,
          metrics: current.endpoint === endpoint ? current.metrics : null,
          failed: true,
        }));
      }
    })();
    refreshInFlight.current = { endpoint, promise };
    void promise.finally(() => {
      if (refreshInFlight.current?.promise === promise) refreshInFlight.current = null;
    });
    return promise;
  }, [endpoint]);

  useEffect(() => {
    if (!endpoint) return;

    const controller = new AbortController();
    void refresh(controller.signal);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [endpoint, refresh]);

  useEffect(() => {
    const previous = lastInvalidation.current;
    lastInvalidation.current = { endpoint, version: invalidationVersion };
    if (
      !endpoint
      || !previous
      || previous.endpoint !== endpoint
      || previous.version === invalidationVersion
    ) return;
    void refresh();
  }, [endpoint, invalidationVersion, refresh]);

  useEffect(() => {
    const finished = wasRunning.current && !hasRunningChat;
    wasRunning.current = hasRunningChat;
    if (finished) void refresh();
  }, [hasRunningChat, refresh]);

  if (!sessionId || !agentSlug) return null;

  const model = live?.model ?? metrics?.model;
  const provider = live?.provider ?? metrics?.provider;
  const effort = live?.reasoningEffort ?? metrics?.reasoningEffort;
  const context = live?.context ?? live?.persistedContext ?? metrics?.context;
  const percent = context ? Math.max(0, Math.min(100, context.percent)) : null;
  const origin = sessionOrigin(metrics?.source);
  const sourceLabel = (origin?.label ?? metrics?.source ?? "Web").toLocaleUpperCase("fr-FR");
  const usageTitle = metrics
    ? [
        `${numberFormatter.format(metrics.usage.inputTokens)} entrée`,
        `${numberFormatter.format(metrics.usage.cacheReadTokens)} cache lu`,
        `${numberFormatter.format(metrics.usage.cacheWriteTokens)} cache écrit`,
        `${numberFormatter.format(metrics.usage.outputTokens)} sortie`,
        `${numberFormatter.format(metrics.usage.reasoningTokens)} raisonnement inclus dans la sortie`,
      ].join(" · ")
    : undefined;

  return (
    <section
      aria-label="Utilisation de la session active"
      className={cn(
        "relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border bg-background px-3.5 py-3",
        "transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          className="h-4.5 px-1.5 font-mono text-[9px] tracking-[0.08em]"
          variant="outline"
        >
          {sourceLabel}
        </Badge>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {metrics ? `${numberFormatter.format(metrics.usage.apiCalls)} appels` : "Synchronisation"}
        </span>
      </div>

      <div className="space-y-0.5" title={usageTitle}>
        <p className="text-[10px] text-muted-foreground">Tokens traités</p>
        <p className="text-sm font-semibold tabular-nums tracking-tight">
          {metrics
            ? numberFormatter.format(metrics.usage.processedTokens)
            : failed
              ? "Indisponibles"
              : "Chargement…"}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-end justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground">Contexte</span>
          {context ? (
            <span className="tabular-nums">
              {numberFormatter.format(context.usedTokens)} / {numberFormatter.format(context.maxTokens)}
            </span>
          ) : (
            <span className="text-muted-foreground">Indisponible</span>
          )}
        </div>
        <div
          aria-label={context
            ? `${numberFormatter.format(context.remainingTokens)} tokens de contexte restants`
            : "Mesure du contexte indisponible"}
          aria-valuemax={context ? 100 : undefined}
          aria-valuemin={context ? 0 : undefined}
          aria-valuenow={percent === null ? undefined : Math.round(percent)}
          aria-valuetext={context
            ? `${percentFormatter.format(percent ?? 0)} pour cent utilisé, ${numberFormatter.format(context.remainingTokens)} tokens restants`
            : "Indisponible"}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out",
              percent === null && "w-1/3 animate-pulse bg-muted-foreground/25",
              percent !== null && percent < 80 && "bg-foreground/55",
              percent !== null && percent >= 80 && percent < 95 && "bg-[color:var(--warn)]",
              percent !== null && percent >= 95 && "bg-destructive",
            )}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        <p className="text-right text-[10px] tabular-nums text-muted-foreground">
          {context
            ? `${numberFormatter.format(context.remainingTokens)} restants · ${percentFormatter.format(percent ?? 0)} %`
            : "En attente d’une mesure provider"}
        </p>
      </div>

      <div className="grid gap-1 border-t pt-2 text-[10px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <BotIcon className="size-3 shrink-0" />
          <span className="truncate capitalize">{modelLabel(model)}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <BrainIcon className="size-3 shrink-0" />
          <span className="truncate">{effortLabel(provider, model, effort)}</span>
        </span>
        {failed && !metrics ? (
          <span className="flex items-center gap-1.5 text-destructive">
            <MessageCircleIcon className="size-3 shrink-0" />
            Métriques Hermes indisponibles
          </span>
        ) : null}
      </div>
    </section>
  );
}
