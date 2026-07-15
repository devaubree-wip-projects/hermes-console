"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenText } from "lucide-react";
import { CanvasMarkdown } from "@/components/shared/chat/canvas/canvas-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export type CapabilityItem = {
  name: string;
  description: string;
  enabled: boolean;
};

function stripFrontmatter(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function CapabilityGrid({
  items,
  detailEndpoint,
}: {
  items: CapabilityItem[];
  detailEndpoint?: string;
}) {
  const [selected, setSelected] = useState<CapabilityItem | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selected || !detailEndpoint) return;

    const controller = new AbortController();

    fetch(`${detailEndpoint}?name=${encodeURIComponent(selected.name)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { content?: unknown; error?: unknown } | null;
        if (!response.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "Impossible de charger ce skill.");
        }
        if (typeof data?.content !== "string") {
          throw new Error("Hermes a renvoyé un contenu de skill invalide.");
        }
        setContent(stripFrontmatter(data.content));
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Impossible de charger ce skill.");
      });

    return () => controller.abort();
  }, [detailEndpoint, selected]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const card = (
            <Card className="h-full gap-3 shadow-none transition-[background-color,box-shadow] group-hover:bg-muted/20 group-hover:ring-foreground/20">
              <CardHeader className="flex-row items-start justify-between">
                <CardTitle>{item.name}</CardTitle>
                <Badge variant={item.enabled ? "outline" : "secondary"}>{item.enabled ? "Actif" : "Inactif"}</Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="line-clamp-3 text-sm text-muted-foreground">{item.description}</p>
                {detailEndpoint ? (
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <BookOpenText className="size-3.5" />
                    Lire le skill
                  </span>
                ) : null}
              </CardContent>
            </Card>
          );

          return detailEndpoint ? (
            <button
              key={`${item.name}-${index}`}
              type="button"
              className="group cursor-pointer rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-haspopup="dialog"
              aria-label={`Lire le skill ${item.name}`}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setContent(null);
                setError(null);
                setSelected(item);
              }}
            >
              {card}
            </button>
          ) : (
            <div key={`${item.name}-${index}`}>{card}</div>
          );
        })}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent
          className="max-h-[min(85dvh,900px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
          onCloseAutoFocus={(event) => {
            if (!triggerRef.current) return;
            event.preventDefault();
            triggerRef.current.focus();
          }}
        >
          <DialogHeader className="px-5 pt-5 pr-12 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{selected?.name ?? "Skill"}</DialogTitle>
              {selected ? <Badge variant={selected.enabled ? "outline" : "secondary"}>{selected.enabled ? "Actif" : "Inactif"}</Badge> : null}
            </div>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-5 pb-5">
            {error ? (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>
            ) : content === null ? (
              <div className="space-y-3" aria-label="Chargement du skill">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <CanvasMarkdown text={content} isRunning={false} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
