import { Skeleton } from "@/components/shared/chat/ui/skeleton";

function ChatSidebarLoading() {
  return (
    <aside className="flex h-full w-65 flex-col overflow-hidden">
      <div className="mt-2 flex h-12 shrink-0 items-center px-6">
        <Skeleton className="size-5 rounded-md" />
        <Skeleton className="ml-2 h-4 w-28" />
      </div>
      <div className="relative flex-1 overflow-hidden p-3">
        <div className="flex flex-col gap-0.5">
          <Skeleton className="h-8 w-full rounded-md" />
          <div className="px-2.5 pt-4 pb-1">
            <Skeleton className="h-3 w-12" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex h-8 items-center px-2.5">
              <Skeleton
                className="h-3.5"
                style={{ width: `${index % 3 === 0 ? 68 : 86}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ChatHeaderLoading() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4">
      <Skeleton className="hidden size-8 rounded-md md:block" />
      <Skeleton className="h-4 w-24" />
      <div className="ml-auto flex items-center gap-1.5">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="size-8 rounded-md" />
      </div>
    </header>
  );
}

function ChatThreadLoading() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-1 flex-col justify-center overflow-hidden px-4 pt-4">
        <div className="mx-auto mb-6 flex w-full max-w-[44rem] flex-col items-center gap-3 px-4">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-44 max-w-full" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-3 px-4 pb-4 md:pb-6">
        <div className="flex justify-center gap-2 overflow-hidden px-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="border-border/60 rounded-3xl border bg-muted/30 p-2 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:border-muted-foreground/15 dark:shadow-none">
          <Skeleton className="mx-2.5 mt-1 h-6 w-48" />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="h-7 w-32 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="size-7 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatPageLoading() {
  return (
    <div
      role="status"
      aria-label="Loading chat"
      className="flex h-full w-full bg-muted/30"
    >
      <span className="sr-only">Loading chat</span>
      <div className="hidden md:block">
        <ChatSidebarLoading />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden p-2 md:pl-0">
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-background">
          <ChatHeaderLoading />
          <main className="flex-1 overflow-hidden">
            <ChatThreadLoading />
          </main>
        </div>
      </div>
    </div>
  );
}
