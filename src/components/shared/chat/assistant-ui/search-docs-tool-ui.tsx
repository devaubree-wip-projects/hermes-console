"use client"

import { makeAssistantToolUI } from "@assistant-ui/react"
import { Loader2Icon, SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type SearchHit = {
  id: string
  text: string
  score: number
  semantic?: number | null
  matched_by?: "lexical" | "semantic" | "both"
}
type SearchArgs = { query?: string; top_k?: number }

export const SearchDocsToolUI = makeAssistantToolUI<SearchArgs, SearchHit[]>({
  toolName: "search_docs",
  render: ({ args, result, status }) => {
    const query = args?.query
    const running = status.type === "running"
    const hits = Array.isArray(result) ? result : []
    const weak = !running && hits.length > 0 && hits[0].score < 2

    return (
      <div className="my-1.5 w-full overflow-hidden rounded-lg border border-border bg-muted/40 text-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          {running ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">Recherche&nbsp;KB&nbsp;·&nbsp;</span>
            <span className="font-medium">
              {query ? `« ${query} »` : "…"}
            </span>
          </span>
          {!running ? (
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {hits.length} extrait{hits.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>

        {!running && hits.length === 0 ? (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Aucun résultat (RAG stub phase 1) — le modèle devrait reformuler ou
            déléguer à un agent.
          </div>
        ) : null}

        {hits.length > 0 ? (
          <ul className="divide-y divide-border border-t border-border">
            {hits.map((hit) => (
              <li
                key={hit.id}
                className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <div className="flex shrink-0 items-center gap-2">
                  <code className="rounded bg-background px-1.5 py-0.5 text-xs font-medium">
                    {hit.id}
                  </code>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                      hit.score < 2
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    score {hit.score}
                  </span>
                </div>
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {hit.text}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {weak ? (
          <div className="border-t border-border bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            Score faible (&lt; 2) — appariement incertain.
          </div>
        ) : null}
      </div>
    )
  },
})
