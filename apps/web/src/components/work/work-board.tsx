"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type KeyboardEventHandler, type PointerEventHandler } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  BotIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CircleXIcon,
  EyeIcon,
  FolderKanbanIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  SignalHighIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientTaskDetail } from "@/components/work/client-task-detail";
import { invalidateTaskDetail, prefetchTaskDetail } from "@/components/work/task-detail-cache";
import { TaskDetailSheet } from "@/components/work/task-detail-sheet";
import type { TaskDetailSeed } from "@/components/work/task-detail-view";
import { WorkLiveRefresh, type WorkChange } from "@/components/work/work-live-refresh";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkItemPriority, WorkItemStatus } from "@/db/schema";
import {
  canReachWorkItemStatus,
  resolveWorkItemTransitionPath,
  WORK_ITEM_STATUSES,
} from "@/modules/work/domain/work";

type BoardItem = {
  id: string;
  key: string;
  title: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  projectName: string | null;
  assigneeName: string | null;
  activeRunCount: number;
  dueLabel: string | null;
  overdue: boolean;
  updatedLabel: string;
  detailSeed: TaskDetailSeed;
};

type BoardColumn = {
  status: WorkItemStatus;
  label: string;
  hint: string;
};

const columns: BoardColumn[] = [
  { status: "backlog", label: "Backlog", hint: "À qualifier" },
  { status: "todo", label: "À faire", hint: "Prêtes à démarrer" },
  { status: "in_progress", label: "En cours", hint: "Exécution et blocages" },
  { status: "review", label: "En revue", hint: "Validation humaine" },
  { status: "done", label: "Terminées", hint: "Livrées" },
  { status: "cancelled", label: "Annulées", hint: "Hors du flux actif" },
];

const statusLabels: Record<WorkItemStatus, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  review: "En revue",
  done: "Terminée",
  cancelled: "Annulée",
};

const priorityLabels: Record<WorkItemPriority, string> = {
  none: "Sans priorité",
  low: "Priorité basse",
  medium: "Priorité moyenne",
  high: "Priorité haute",
  urgent: "Priorité urgente",
};

function columnItems(items: BoardItem[], status: WorkItemStatus) {
  return items.filter((item) => item.status === status || (status === "in_progress" && item.status === "blocked"));
}

function visualStatus(status: WorkItemStatus): WorkItemStatus {
  return status === "blocked" ? "in_progress" : status;
}

function isColumnDroppableId(id: UniqueIdentifier) {
  return String(id).startsWith("column:");
}

function StatusIcon({ status }: { status: WorkItemStatus }) {
  const className = cn("size-3.5", {
    "text-muted-foreground": status === "backlog" || status === "todo" || status === "cancelled",
    "text-blue-500": status === "in_progress",
    "text-amber-500": status === "review",
    "text-emerald-500": status === "done",
  });
  if (status === "backlog") return <CircleDashedIcon className={className} />;
  if (status === "in_progress") return <CircleDotIcon className={className} />;
  if (status === "review") return <EyeIcon className={className} />;
  if (status === "done") return <CheckCircle2Icon className={className} />;
  if (status === "cancelled") return <CircleXIcon className={className} />;
  return <CircleIcon className={className} />;
}

function PriorityMark({ priority }: { priority: WorkItemPriority }) {
  return (
    <span title={priorityLabels[priority]} aria-label={priorityLabels[priority]} className={cn("inline-flex", {
      "text-muted-foreground/45": priority === "none",
      "text-sky-500": priority === "low",
      "text-amber-500": priority === "medium",
      "text-orange-500": priority === "high",
      "text-red-500": priority === "urgent",
    })}>
      <SignalHighIcon className="size-3.5" />
    </span>
  );
}

function initials(value: string | null) {
  if (!value) return "—";
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function CardBody({ item, canEdit, moving, onMove, onOpen, onPrefetch }: {
  item: BoardItem;
  canEdit: boolean;
  moving: boolean;
  onMove: (item: BoardItem, status: WorkItemStatus) => void;
  onOpen: () => void;
  onPrefetch: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 pr-12">
        <PriorityMark priority={item.priority} />
        <span className="font-mono text-[10px] font-medium text-muted-foreground">{item.key}</span>
        {item.activeRunCount > 0 ? <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400"><CircleDotIcon className="size-3 animate-pulse motion-reduce:animate-none" />Hermes actif</span> : null}
      </div>
      <button
        type="button"
        data-testid="task-card-open"
        data-task-id={item.id}
        onClick={onOpen}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        className="mt-2 block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="line-clamp-2 text-[13px] font-medium leading-[1.35rem] text-foreground">{item.title}</span>
        {item.description ? <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.description}</span> : null}
      </button>
      {item.status === "blocked" || item.projectName ? <div className="mt-2.5 flex flex-wrap gap-1.5">
        {item.status === "blocked" ? <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">Bloquée</Badge> : null}
        {item.projectName ? <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]"><FolderKanbanIcon className="size-2.5" />{item.projectName}</Badge> : null}
      </div> : null}
      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5 text-[10px] text-muted-foreground">
        <Avatar size="sm" className="size-5"><AvatarFallback className="text-[8px]"><BotIcon className={cn("size-2.5", item.assigneeName && "hidden")} />{item.assigneeName ? initials(item.assigneeName) : null}</AvatarFallback></Avatar>
        <span className="min-w-0 flex-1 truncate">{item.assigneeName ?? "Non assignée"}</span>
        {item.dueLabel ? <span className={cn("inline-flex items-center gap-1", item.overdue && "font-medium text-destructive")}><CalendarClockIcon className="size-3" />{item.dueLabel}</span> : <span title={`Mise à jour ${item.updatedLabel}`}>{item.updatedLabel}</span>}
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" disabled={moving} aria-label={`Changer le statut de ${item.key}`} className="-mr-1"><MoreHorizontalIcon /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Déplacer vers</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {WORK_ITEM_STATUSES.filter((next) => next !== item.status && canReachWorkItemStatus(item.status, next)).map((next) => <DropdownMenuItem key={next} onSelect={() => onMove(item, next)}><StatusIcon status={next} />{statusLabels[next]}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </>
  );
}

function WorkCard({ item, canEdit, moving, onMove, onOpen, onPrefetch }: {
  item: BoardItem;
  canEdit: boolean;
  moving: boolean;
  onMove: (item: BoardItem, status: WorkItemStatus) => void;
  onOpen: () => void;
  onPrefetch: () => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit || moving,
    data: { columnStatus: visualStatus(item.status) },
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined,
    transition,
  };
  return (
    <li ref={setNodeRef} style={style} onPointerDown={canEdit ? (listeners?.onPointerDown as PointerEventHandler | undefined) : undefined} className={cn("relative rounded-lg border border-border/75 bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,opacity] hover:border-foreground/20 hover:shadow-sm", canEdit && "cursor-grab active:cursor-grabbing", isDragging && "z-20 opacity-30")}>
      {canEdit ? <button ref={setActivatorNodeRef} type="button" {...attributes} onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined} aria-label={`Déplacer ${item.key}`} className="absolute right-8 top-2.5 flex size-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"><GripVerticalIcon className="size-3.5" /></button> : null}
      <CardBody item={item} canEdit={canEdit} moving={moving} onMove={onMove} onOpen={onOpen} onPrefetch={onPrefetch} />
    </li>
  );
}

function KanbanColumn({ column, items, canEdit, movingId, onMove, onOpen, onPrefetch }: {
  column: BoardColumn;
  items: BoardItem[];
  canEdit: boolean;
  movingId: string | null;
  onMove: (item: BoardItem, status: WorkItemStatus) => void;
  onOpen: (itemId: string) => void;
  onPrefetch: (itemId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.status}`, disabled: !canEdit });
  return (
    <section ref={setNodeRef} aria-label={`Colonne ${column.label}`} className={cn("flex h-full min-h-72 w-[280px] shrink-0 flex-col rounded-xl border border-transparent bg-muted/45 p-2 transition-colors", isOver && "border-primary/35 bg-primary/5")}>
      <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
        <StatusIcon status={column.status} />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-medium leading-none">{column.label}</h3>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{column.hint}</p>
        </div>
        <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <SortableContext id={`column:${column.status}`} items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg">
          {items.length ? <ul className="space-y-2 p-0.5">{items.map((item) => <WorkCard key={item.id} item={item} canEdit={canEdit} moving={movingId === item.id} onMove={onMove} onOpen={() => onOpen(item.id)} onPrefetch={() => onPrefetch(item.id)} />)}</ul> : <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border/70 px-5 text-center text-[11px] text-muted-foreground">Aucune tâche dans cette étape</div>}
        </div>
      </SortableContext>
    </section>
  );
}

export function WorkBoard({ apiBase, taskBase, items, canEdit }: { apiBase: string; taskBase: string; items: BoardItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [boardItems, setBoardItems] = useState(items);
  const [serverItems, setServerItems] = useState(items);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  // Prefer pointer hit-testing over closestCorners — tall columns make corner
  // distance keep selecting the source column while the cursor is already over
  // another lane. The ref is read at drag-time inside this callback, never during render.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    const intersections = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);

    if (intersections.length > 0) {
      // Cards nest inside column droppables; prefer the card under the pointer.
      const overCards = intersections.filter((collision) => !isColumnDroppableId(collision.id));
      const overId = getFirstCollision(overCards.length > 0 ? overCards : intersections, "id");
      if (overId != null) {
        lastOverId.current = overId;
        return [{ id: overId }];
      }
    }

    // Pointer in the gap between columns — keep the last valid target.
    if (lastOverId.current != null) {
      return [{ id: lastOverId.current }];
    }

    return closestCorners(args);
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeItem = useMemo(() => boardItems.find((item) => item.id === activeId) ?? null, [activeId, boardItems]);
  const selectedTask = useMemo(() => boardItems.find((item) => item.id === selectedTaskId) ?? null, [boardItems, selectedTaskId]);

  if (items !== serverItems) {
    setServerItems(items);
    setBoardItems(items);
  }

  function handleWorkChange(change: WorkChange) {
    if (change.source === "snapshot") return;
    if (change.workItemId) invalidateTaskDetail(apiBase, change.workItemId);
    router.refresh();
  }

  function preparePlacement(activeItemId: string, targetColumn: WorkItemStatus, overId: string, explicitStatus?: WorkItemStatus) {
    const active = boardItems.find((item) => item.id === activeItemId);
    if (!active) return null;
    const sourceColumn = visualStatus(active.status);
    const nextStatus = explicitStatus ?? (sourceColumn === targetColumn ? active.status : targetColumn);
    const transitionPath = resolveWorkItemTransitionPath(active.status, nextStatus);
    if (!transitionPath) {
      toast.error(`Transition ${statusLabels[active.status]} → ${statusLabels[nextStatus]} interdite.`);
      return null;
    }

    const groups = new Map<WorkItemStatus, BoardItem[]>();
    for (const column of columns) groups.set(column.status, columnItems(boardItems, column.status));
    const sourceItems = groups.get(sourceColumn) ?? [];
    const targetItems = groups.get(targetColumn) ?? [];
    let reorderedTarget: BoardItem[];
    if (sourceColumn === targetColumn) {
      const oldIndex = sourceItems.findIndex((item) => item.id === active.id);
      const overIndex = overId.startsWith("column:")
        ? sourceItems.length - 1
        : sourceItems.findIndex((item) => item.id === overId);
      if (oldIndex < 0 || overIndex < 0) return null;
      reorderedTarget = arrayMove(sourceItems, oldIndex, overIndex).map((item) => item.id === active.id ? { ...item, status: nextStatus } : item);
    } else {
      const nextActive = { ...active, status: nextStatus };
      const withoutActive = sourceItems.filter((item) => item.id !== active.id);
      const insertionIndex = overId.startsWith("column:")
        ? targetItems.length
        : targetItems.findIndex((item) => item.id === overId);
      reorderedTarget = [...targetItems];
      reorderedTarget.splice(insertionIndex < 0 ? reorderedTarget.length : insertionIndex, 0, nextActive);
      groups.set(sourceColumn, withoutActive);
    }
    groups.set(targetColumn, reorderedTarget);
    const nextItems = columns.flatMap((column) => groups.get(column.status) ?? []);
    const activeIndex = reorderedTarget.findIndex((item) => item.id === active.id);
    const previousItemId = activeIndex > 0 ? reorderedTarget[activeIndex - 1]!.id : null;
    const nextItemId = activeIndex < reorderedTarget.length - 1 ? reorderedTarget[activeIndex + 1]!.id : null;
    const orderChanged = nextItems.map((item) => item.id).join(":") !== boardItems.map((item) => item.id).join(":");
    if (!orderChanged && active.status === nextStatus) return null;
    return { active, nextItems, nextStatus, previousItemId, nextItemId, transitionPath };
  }

  async function persistPlacement(placement: NonNullable<ReturnType<typeof preparePlacement>>) {
    const previousItems = boardItems;
    setMovingId(placement.active.id);
    setBoardItems(placement.nextItems);
    try {
      // Multi-hop targets (ex. backlog → done) are resolved server-side via the
      // shared domain pathfinder; one PATCH applies the final status async.
      const response = await fetch(`${apiBase}/work-items/${placement.active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: placement.nextStatus,
          placement: {
            previousItemId: placement.previousItemId,
            nextItemId: placement.nextItemId,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setBoardItems(previousItems);
        toast.error(payload.error ?? "Déplacement impossible.");
        return;
      }
      toast.success(
        placement.transitionPath.length > 1
          ? `Transition via ${placement.transitionPath.map((status) => statusLabels[status]).join(" → ")}.`
          : "Position de la tâche mise à jour.",
        { position: "bottom-right" },
      );
      router.refresh();
    } catch {
      setBoardItems(previousItems);
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setMovingId(null);
    }
  }

  function move(item: BoardItem, status: WorkItemStatus) {
    const targetColumn = visualStatus(status);
    const placement = preparePlacement(item.id, targetColumn, `column:${targetColumn}`, status);
    if (placement) void persistPlacement(placement);
  }

  function handleDragStart(event: DragStartEvent) {
    lastOverId.current = null;
    setActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    lastOverId.current = null;
    setActiveId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over?.id ? String(event.over.id) : lastOverId.current ? String(lastOverId.current) : "";
    lastOverId.current = null;
    if (!overId) return;
    const overItem = boardItems.find((item) => item.id === overId);
    const targetColumn = overId.startsWith("column:")
      ? overId.slice(7) as WorkItemStatus
      : overItem
        ? visualStatus(overItem.status)
        : null;
    if (!targetColumn) return;
    const placement = preparePlacement(String(event.active.id), targetColumn, overId);
    if (placement) void persistPlacement(placement);
  }

  return (
    <>
      <WorkLiveRefresh endpoint={`${apiBase}/work-stream`} onChanged={handleWorkChange} />
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-4 pb-4 pt-3" data-testid="tasks-kanban">
          {columns.map((column) => <KanbanColumn key={column.status} column={column} items={columnItems(boardItems, column.status)} canEdit={canEdit} movingId={movingId} onMove={(item, status) => void move(item, status)} onOpen={setSelectedTaskId} onPrefetch={(itemId) => void prefetchTaskDetail(apiBase, itemId)} />)}
        </div>
        <DragOverlay>
          {activeItem ? <div className="w-[280px] rotate-1 rounded-lg border bg-card p-3 shadow-xl"><CardBody item={activeItem} canEdit={false} moving={false} onMove={() => undefined} onOpen={() => undefined} onPrefetch={() => undefined} /></div> : null}
        </DragOverlay>
      </DndContext>
      {selectedTaskId ? (
        <TaskDetailSheet onClose={() => setSelectedTaskId(null)}>
          <ClientTaskDetail key={selectedTaskId} apiBase={apiBase} workspaceBase={taskBase.slice(0, -"/tasks".length)} taskId={selectedTaskId} initialDetail={selectedTask?.detailSeed} canEdit={canEdit} onSelectTask={setSelectedTaskId} />
        </TaskDetailSheet>
      ) : null}
    </>
  );
}
