"use client"

import { makeAssistantToolUI } from "@assistant-ui/react"
import { BotIcon, Loader2Icon, WrenchIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type DelegateArgs = { agent?: string; task?: string; context?: string }
type DelegateStep = {
  tool: string
  args: Record<string, unknown>
  result_preview: string
}
type DelegateResult = {
  ok?: boolean
  error?: string
  available?: string[]
  agent?: string
  task?: string
  answer?: string
  steps?: DelegateStep[]
  steps_count?: number
}

export const DelegateAgentToolUI = makeAssistantToolUI<
  DelegateArgs,
  DelegateResult
>({
  toolName: "delegate_to_agent",
  render: ({ args, result, status }) => {
    const running = status.type === "running"
    const failed = Boolean(result?.error)
    const steps = result?.steps ?? []

    return (
      <div className="my-1.5 w-full overflow-hidden rounded-lg border border-border bg-muted/40 text-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          {running ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <BotIcon
              className={cn(
                "size-4 shrink-0",
                failed ? "text-destructive" : "text-muted-foreground",
              )}
            />
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">
              Délégation&nbsp;·&nbsp;agent&nbsp;
            </span>
            <span className="font-medium">{args?.agent ?? "…"}</span>
          </span>
          {!running && !failed ? (
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {steps.length} étape{steps.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>

        {args?.task ? (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Tâche&nbsp;:</span>{" "}
            {args.task}
          </div>
        ) : null}

        {failed ? (
          <div className="border-t border-border bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {result?.error}
            {result?.available?.length ? (
              <> — agents disponibles : {result.available.join(", ")}</>
            ) : null}
          </div>
        ) : null}

        {steps.length > 0 ? (
          <ul className="divide-y divide-border border-t border-border">
            {steps.map((step, index) => (
              <li
                key={`${step.tool}-${index}`}
                className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <div className="flex shrink-0 items-center gap-2">
                  <WrenchIcon className="size-3.5 text-muted-foreground" />
                  <code className="rounded bg-background px-1.5 py-0.5 text-xs font-medium">
                    {step.tool}
                  </code>
                </div>
                <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
                  {JSON.stringify(step.args)} → {step.result_preview}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {!running && result?.answer ? (
          <div className="border-t border-border bg-background/60 px-3 py-2 text-xs">
            <span className="font-medium">
              Réponse de l’agent {result.agent}&nbsp;:
            </span>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {result.answer}
            </p>
          </div>
        ) : null}
      </div>
    )
  },
})
