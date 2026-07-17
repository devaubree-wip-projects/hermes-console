"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function TaskDetailLoading() {
  return (
    <div role="status" aria-label="Chargement de la tâche" className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b px-7 py-5 pr-14">
        <div className="h-4 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-8 px-7 py-7">
          <div className="space-y-3">
            <div className="h-3 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-full animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          </div>
          <div className="space-y-3 border-t pt-7">
            <div className="h-3 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-16 w-full animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
          </div>
        </div>
        <div className="hidden border-l bg-muted/25 px-5 py-6 lg:block">
          <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-5 h-20 animate-pulse rounded-lg bg-muted/70 motion-reduce:animate-none" />
          <div className="mt-7 h-3 w-12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-5 h-24 animate-pulse rounded-lg bg-muted/70 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export function TaskDetailSheet({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    if (onClose) {
      onClose();
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("task");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent
        side="right"
        className="gap-0 overflow-hidden border-l border-border/80 bg-background p-0 shadow-[-20px_0_60px_-32px_oklch(0.145_0_0_/_0.35)]"
        style={{ width: "min(94vw, 64rem)", maxWidth: "none" }}
      >
        <SheetTitle className="sr-only">Détail de la tâche</SheetTitle>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
