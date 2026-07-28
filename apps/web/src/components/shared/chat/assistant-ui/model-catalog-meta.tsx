"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatModelPrice,
  getOpenAiModelMeta,
  OPENAI_TIER_LABELS,
  type OpenAiModelMeta,
} from "@/components/shared/chat/constants/openai-model-catalog";
import { cn } from "@/lib/utils";

export function ModelCatalogMeta({
  modelId,
  className,
}: {
  modelId: string;
  className?: string;
}) {
  const meta = getOpenAiModelMeta(modelId);
  if (!meta) return null;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
        {OPENAI_TIER_LABELS[meta.tier]}
      </Badge>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {formatModelPrice(meta)}
      </span>
    </span>
  );
}

export function ModelCatalogRow({
  modelId,
  selected = false,
  onSelect,
}: {
  modelId: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const meta = getOpenAiModelMeta(modelId);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "hover:bg-secondary flex min-h-8 w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
        selected && "bg-secondary",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs font-medium">{modelId}</span>
        {meta ? (
          <span className="mt-0.5 block">
            <ModelCatalogMeta modelId={modelId} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function describeModelMeta(meta: OpenAiModelMeta) {
  const parts = [OPENAI_TIER_LABELS[meta.tier], formatModelPrice(meta)];
  if (meta.context) parts.push(`${Math.round(meta.context / 1000)}k ctx`);
  return parts.join(" · ");
}
