import { SpinnerCustom } from "@/components/ui/spinner";

function ChatSidebarLoading() {
  return (
    <aside className="flex h-full w-65 flex-col overflow-hidden">
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <SpinnerCustom />
      </div>
    </aside>
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
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-background" />
      </div>
    </div>
  );
}
