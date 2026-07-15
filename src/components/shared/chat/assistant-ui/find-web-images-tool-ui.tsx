"use client"

import { makeAssistantToolUI } from "@assistant-ui/react"
import { ImageIcon, Loader2Icon } from "lucide-react"

type FoundImage = {
  url: string
  title: string
  license: string
  source: string
  page?: string
}

type FindWebImagesArgs = { query?: string; top_k?: number }
type FindWebImagesResult = {
  count?: number
  images?: FoundImage[]
  note?: string
}

export const FindWebImagesToolUI = makeAssistantToolUI<
  FindWebImagesArgs,
  FindWebImagesResult
>({
  toolName: "find_web_images",
  render: ({ args, result, status }) => {
    const running = status.type === "running"
    const query = typeof args?.query === "string" ? args.query : undefined
    const images = result?.images ?? []

    return (
      <div className="my-1.5 w-full overflow-hidden rounded-lg border border-border bg-muted/40 text-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          {running ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">Photos&nbsp;web&nbsp;·&nbsp;</span>
            <span className="font-medium">{query ? `« ${query} »` : "…"}</span>
          </span>
          {!running ? (
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {images.length} image{images.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>

        {!running && images.length === 0 ? (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Aucune image web trouvée — schéma SVG en secours.
          </div>
        ) : null}

        {images.length > 0 ? (
          <div className="scrollbar-none flex gap-2 overflow-x-auto border-t border-border p-2">
            {images.map((image) => (
              <a
                key={image.url}
                href={image.page || image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-32 shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.title}
                  loading="lazy"
                  className="h-20 w-32 rounded-md border border-border object-cover"
                />
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                  {image.title}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground/70">
                  {image.source} · {image.license}
                </span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    )
  },
})
