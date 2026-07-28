"use client";

import { useState } from "react";
import { BotIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { ModelCatalogMeta } from "@/components/shared/chat/assistant-ui/model-catalog-meta";
import {
  displayModelId,
  getOpenAiModelMeta,
  isOpenAiApiProvider,
  sortOpenAiModels,
} from "@/components/shared/chat/constants/openai-model-catalog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/chat/ui/popover";
import { cn } from "@/lib/utils";

export function InferenceModelSelect({
  id,
  providerId,
  models,
  value,
  disabled,
  onValueChange,
}: {
  id: string;
  providerId: string;
  models: readonly string[];
  value: string;
  disabled?: boolean;
  onValueChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sortedModels = isOpenAiApiProvider(providerId)
    ? sortOpenAiModels(models)
    : [...models];
  const selectedMeta = getOpenAiModelMeta(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Modèle</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled || sortedModels.length === 0}
            className={cn(
              "border-input bg-background hover:bg-muted/40 flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm transition-colors",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <BotIcon className="text-muted-foreground size-4 shrink-0" />
              {value ? (
                <>
                  <span className="truncate font-mono text-xs font-medium">
                    {displayModelId(value)}
                  </span>
                  {selectedMeta ? (
                    <ModelCatalogMeta modelId={value} className="hidden sm:inline-flex" />
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {sortedModels.length ? "Choisir un modèle" : "Aucun modèle chargé"}
                </span>
              )}
            </span>
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-h-80 overflow-y-auto rounded-xl p-1 shadow-md"
        >
          {sortedModels.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onValueChange(option);
                setOpen(false);
              }}
              className={cn(
                "hover:bg-secondary flex min-h-9 w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                option === value && "bg-secondary",
              )}
            >
              <BotIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs font-medium">{displayModelId(option)}</span>
                <ModelCatalogMeta modelId={option} className="mt-1" />
              </span>
              {option === value ? <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" /> : null}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
