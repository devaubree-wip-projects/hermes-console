import { Button } from "@/components/shared/chat/ui/button";
import { Skeleton } from "@/components/shared/chat/ui/skeleton";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type FC } from "react";
import { useChatRunStore } from "@/lib/shared/chat/chat-run-store";
import { sessionOrigin } from "@/lib/hermes/session-origin";
import { useChatRoutes } from "@/components/shared/chat/chat-routes-context";
import { Badge } from "@/components/shared/chat/assistant-ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/chat/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shared/chat/ui/alert-dialog";

export const ThreadList: FC = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-0.5">
      <ThreadListNew />
      {!hydrated ? (
        <ThreadListSkeleton />
      ) : (
        <>
          <AuiIf condition={(s) => s.threads.isLoading}>
            <ThreadListSkeleton />
          </AuiIf>
          <AuiIf condition={(s) => !s.threads.isLoading}>
            <ThreadListItems />
          </AuiIf>
        </>
      )}
    </ThreadListPrimitive.Root>
  );
};

export const ArchivedThreadsButton: FC = () => {
  const archivedIds = useAuiState((s) => s.threads.archivedThreadIds);

  if (archivedIds.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/60 p-2">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArchiveIcon className="size-4 shrink-0" />
            <span>Archivées</span>
            <span className="ms-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
              {archivedIds.length}
            </span>
          </button>
        </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sessions archivées</DialogTitle>
          <DialogDescription>
            Restaure une session pour la remettre dans la sidebar, ou
            supprime-la définitivement.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 max-h-[60dvh] overflow-y-auto px-1">
          <div className="flex flex-col gap-0.5">
            <ThreadListPrimitive.Items archived>
              {() => <ArchivedDialogItem />}
            </ThreadListPrimitive.Items>
          </div>
        </div>
      </DialogContent>
      </Dialog>
    </div>
  );
};

const ArchivedDialogItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">
        <ThreadListItemPrimitive.Title fallback="Nouvelle session" />
      </span>
      <ThreadListItemPrimitive.Unarchive asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 cursor-pointer gap-1.5 px-2 hover:bg-transparent"
        >
          <ArchiveRestoreIcon className="size-3.5" />
          Restaurer
        </Button>
      </ThreadListItemPrimitive.Unarchive>
      <DeleteArchivedThread />
    </ThreadListItemPrimitive.Root>
  );
};

const DeleteArchivedThread: FC = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive size-7 shrink-0 cursor-pointer p-0 hover:bg-transparent"
          aria-label="Supprimer la session"
          title="Supprimer"
        >
          <TrashIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Supprimer la session ?</DialogTitle>
          <DialogDescription>
            Cette action est définitive. La session et tous ses messages
            seront supprimés.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="cursor-pointer">
              Annuler
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <ThreadListItemPrimitive.Delete asChild>
              <Button variant="destructive" className="cursor-pointer">
                Supprimer
              </Button>
            </ThreadListItemPrimitive.Delete>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DAY_IN_MS = 86_400_000;

const dateGroupLabel = (
  date: Date | undefined,
  startOfToday: number,
): string => {
  if (!date || date.getTime() >= startOfToday) return "Aujourd’hui";
  if (date.getTime() >= startOfToday - DAY_IN_MS) return "Hier";
  return "Plus tôt";
};

type ThreadListGroup = { label: string; indices: number[] };

const ThreadListItems: FC = () => {
  const threadIds = useAuiState((s) => s.threads.threadIds);
  const threadItems = useAuiState((s) => s.threads.threadItems);

  const groups = useMemo<ThreadListGroup[] | null>(() => {
    const itemsById = new Map(threadItems.map((item) => [item.id, item]));
    const dates = threadIds.map((id) => itemsById.get(id)?.lastMessageAt);
    if (!dates.some(Boolean)) return null;

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const time = (index: number) =>
      dates[index]?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const indices = threadIds
      .map((_, index) => index)
      .sort((a, b) => time(b) - time(a));

    const result: ThreadListGroup[] = [];
    for (const index of indices) {
      const label = dateGroupLabel(dates[index], startOfToday);
      const lastGroup = result[result.length - 1];
      if (lastGroup?.label === label) {
        lastGroup.indices.push(index);
      } else {
        result.push({ label, indices: [index] });
      }
    }
    return result;
  }, [threadIds, threadItems]);

  if (!groups) {
    return (
      <ThreadListPrimitive.Items>
        {() => <ThreadListItem />}
      </ThreadListPrimitive.Items>
    );
  }

  return groups.map((group) => (
    <Fragment key={group.label}>
      <div className="aui-thread-list-group-label text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium">
        {group.label}
      </div>
      {group.indices.map((index) => (
        <ThreadListPrimitive.ItemByIndex
          key={threadIds[index]}
          index={index}
          components={{ ThreadListItem }}
        />
      ))}
    </Fragment>
  ));
};

const ThreadListNew: FC = () => {
  const { baseWithAgent: v1ChatBaseWithAgent } = useChatRoutes();

  return (
    <Button
      variant="ghost"
      className="aui-thread-list-new hover:bg-muted data-active:bg-muted h-8 cursor-pointer justify-start gap-2 rounded-md px-2.5 text-sm font-normal"
      onClick={() => {
        window.history.pushState(null, "", v1ChatBaseWithAgent);
      }}
    >
      <PlusIcon className="size-4" />
      Nouvelle session
    </Button>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex h-8 items-center px-2.5"
        >
          <Skeleton className="aui-thread-list-skeleton h-3.5 w-full" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItemTitle: FC = () => {
  const title = useAuiState((s) => s.threadListItem.title);
  const status = useAuiState((s) => s.threadListItem.status);

  if (!title && status === "regular") {
    return (
      <Skeleton className="aui-thread-list-title-skeleton h-3.5 w-[65%] max-w-48" />
    );
  }

  return <ThreadListItemPrimitive.Title fallback="Nouvelle session" />;
};

const ThreadListItem: FC = () => {
  const threadId = useAuiState((s) => s.threadListItem.id);
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const source = useAuiState((s) => s.threadListItem.custom?.source);
  const origin = sessionOrigin(source);
  const isRunning = useChatRunStore((s) => s.isThreadRunning(threadId));
  const { threadUrl: v1ChatThreadUrl } = useChatRoutes();

  return (
    <ThreadListItemPrimitive.Root
      className="aui-thread-list-item group hover:bg-muted focus-visible:bg-muted data-active:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none"
      aria-busy={isRunning}
    >
      <button
        type="button"
        className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 cursor-pointer items-center px-2.5 text-start text-sm group-hover:pe-9 group-has-data-[state=open]:pe-9 group-data-active:pe-9"
        onClick={() => {
          window.history.pushState(null, "", v1ChatThreadUrl(remoteId ?? threadId));
        }}
      >
        <span className="aui-thread-list-item-title min-w-0 flex-1 truncate">
          <ThreadListItemTitle />
        </span>
        {origin ? (
          <Badge
            variant="muted"
            size="sm"
            className={
              origin.id === "telegram"
                ? "ms-1.5 h-5 shrink-0 bg-[oklch(0.62_0.24_255)] px-1.5 py-0 text-[10px] leading-none text-[oklch(0.985_0.003_255)] hover:bg-[oklch(0.62_0.24_255)] dark:bg-[oklch(0.68_0.22_255)] dark:text-[oklch(0.985_0.003_255)] dark:hover:bg-[oklch(0.68_0.22_255)]"
                : "ms-1.5 h-5 shrink-0 px-1.5 py-0 text-[10px] leading-none"
            }
            title={`Canal de session : ${origin.label}`}
          >
            {origin.label}
          </Badge>
        ) : null}
        {isRunning ? (
          <Loader2Icon
            data-slot="aui-thread-list-item-loader"
            className="text-muted-foreground ms-2 size-3.5 shrink-0 animate-spin"
            aria-label="En cours"
          />
        ) : null}
      </button>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC = () => {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const threadId = useAuiState((s) => s.threadListItem.id);
  const isMain = useAuiState((s) => s.threads.mainThreadId === threadId);
  const { baseWithAgent } = useChatRoutes();

  return (
    <>
      <ThreadListItemMorePrimitive.Root>
        <ThreadListItemMorePrimitive.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="aui-thread-list-item-more data-[state=open]:bg-accent absolute end-1.5 top-1/2 size-6 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 group-data-active:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontalIcon className="size-3.5" />
            <span className="sr-only">More options</span>
          </Button>
        </ThreadListItemMorePrimitive.Trigger>
        <ThreadListItemMorePrimitive.Content
          side="right"
          align="start"
          sideOffset={6}
          className="aui-thread-list-item-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ThreadListItemPrimitive.Archive asChild>
            <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <ArchiveIcon className="size-4" />
              Archive
            </ThreadListItemMorePrimitive.Item>
          </ThreadListItemPrimitive.Archive>
          <ThreadListItemMorePrimitive.Item
            className="aui-thread-list-item-more-item text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none"
            onSelect={(event) => {
              event.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <TrashIcon className="size-4" />
            Delete
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la conversation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. La conversation et tous ses
              messages seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Annuler
            </AlertDialogCancel>
            <ThreadListItemPrimitive.Delete asChild>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 cursor-pointer text-white"
                onClick={() => {
                  if (isMain) window.history.replaceState(null, "", baseWithAgent);
                }}
              >
                Supprimer
              </AlertDialogAction>
            </ThreadListItemPrimitive.Delete>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
