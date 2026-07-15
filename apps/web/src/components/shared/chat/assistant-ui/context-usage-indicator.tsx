"use client";

import { useThreadTokenUsage } from "@assistant-ui/react-ai-sdk";
import { getModelContextWindow } from "@/components/shared/chat/docs/assistant/docs-model-options";
import type { ModelId } from "@/components/shared/chat/constants/model";
import { DEFAULT_MODEL_ID } from "@/components/shared/chat/constants/model";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/chat/ui/tooltip";
import { cn } from "@/lib/utils";

export function useThreadContextUsage(modelId: ModelId) {
  const usage = useThreadTokenUsage();
  const contextWindow = getModelContextWindow(modelId);
  const usedTokens = usage?.inputTokens ?? usage?.totalTokens ?? 0;
  const percent =
    contextWindow > 0 ? Math.min(usedTokens / contextWindow, 1) : 0;

  return {
    usedTokens,
    contextWindow,
    percent,
  };
}

type ContextUsageIndicatorProps = {
  modelId?: ModelId;
  usedTokens?: number;
  contextWindow?: number;
  percent?: number;
  className?: string;
};

export function ContextUsageIndicator({
  modelId,
  usedTokens: usedTokensProp,
  contextWindow: contextWindowProp,
  percent: percentProp,
  className,
}: ContextUsageIndicatorProps) {
  const fallback = useThreadContextUsage(modelId ?? DEFAULT_MODEL_ID);
  const usedTokens = usedTokensProp ?? fallback.usedTokens;
  const contextWindow = contextWindowProp ?? fallback.contextWindow;
  const percent = percentProp ?? fallback.percent;
  const percentLabel = (percent * 100).toFixed(1).replace(/\.0$/, "");
  const size = 18;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent);
  const strokeClass =
    percent >= 0.95
      ? "stroke-destructive"
      : percent >= 0.8
        ? "stroke-[color:var(--warn)]"
        : "stroke-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-slot="context-usage-indicator"
          data-used-tokens={usedTokens}
          data-context-window={contextWindow}
          data-percent={percent}
          aria-label={`Context usage ${percentLabel}%`}
          className={cn(
            "text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            aria-hidden
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              className="stroke-border"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              className={strokeClass}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {contextWindow > 0 ? `${percentLabel} % utilisé` : "Contexte indisponible"}
      </TooltipContent>
    </Tooltip>
  );
}
