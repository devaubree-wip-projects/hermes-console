"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleDotIcon } from "lucide-react";
import { toast } from "sonner";
import { WorkItemStatusBadge } from "@/components/work/work-status-badge";
import type { WorkItemStatus } from "@/db/schema";

type BoardItem = {
  id: string;
  key: string;
  title: string;
  status: WorkItemStatus;
  assigneeName: string | null;
  activeRunCount: number;
};

const columns: Array<{ status: WorkItemStatus; label: string }> = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "À faire" },
  { status: "in_progress", label: "En cours" },
  { status: "review", label: "En revue" },
  { status: "done", label: "Terminées" },
];

const allowedTransitions: Record<WorkItemStatus, WorkItemStatus[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["backlog", "in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "review", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  review: ["in_progress", "done", "cancelled"],
  done: ["todo"],
  cancelled: ["backlog"],
};

const statusLabels: Record<WorkItemStatus, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  review: "En revue",
  done: "Terminée",
  cancelled: "Annulée",
};

export function WorkBoard({ apiBase, taskBase, items, canEdit }: { apiBase: string; taskBase: string; items: BoardItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [movingId, setMovingId] = useState<string | null>(null);

  async function move(item: BoardItem, status: WorkItemStatus) {
    if (item.status === status || !allowedTransitions[item.status].includes(status)) {
      if (item.status !== status) toast.error(`Transition ${statusLabels[item.status]} → ${statusLabels[status]} interdite.`);
      return;
    }
    setMovingId(item.id);
    try {
      const response = await fetch(`${apiBase}/work-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) return toast.error(payload.error ?? "Déplacement impossible.");
      router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setMovingId(null); }
  }

  return <div>
    {canEdit ? <p className="mb-3 text-xs text-muted-foreground">Glissez une carte vers une colonne compatible, ou utilisez son sélecteur d’état au clavier.</p> : null}
    <div className="grid min-w-max grid-cols-5 gap-3 overflow-x-auto pb-3">{columns.map(({ status }) => {
      const column = items.filter((item) => item.status === status || (status === "in_progress" && item.status === "blocked"));
      return <section
        key={status}
        aria-label={`Colonne ${statusLabels[status]}`}
        className="w-64 rounded-xl bg-muted/45 p-2"
        onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
        onDrop={canEdit ? (event) => {
          event.preventDefault();
          const item = items.find((candidate) => candidate.id === event.dataTransfer.getData("application/x-hermes-work-item"));
          if (item) void move(item, status);
        } : undefined}
      >
        <div className="flex items-center justify-between px-2 py-1.5"><WorkItemStatusBadge status={status} /><span className="font-mono text-xs text-muted-foreground">{column.length}</span></div>
        <ul className="mt-2 space-y-2">{column.map((item) => <li key={item.id} draggable={canEdit && movingId !== item.id} onDragStart={(event) => event.dataTransfer.setData("application/x-hermes-work-item", item.id)} className="rounded-lg border bg-card p-3 shadow-xs">
          <Link href={`${taskBase}/${item.id}`} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-mono text-[11px] text-muted-foreground">{item.key}</span><span className="mt-1 block text-sm font-medium leading-5">{item.title}</span><span className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{item.assigneeName ?? "Non assignée"}</span>{item.activeRunCount ? <CircleDotIcon className="size-3 text-blue-500" aria-label="Run actif" /> : null}</span></Link>
          {canEdit ? <label className="mt-3 block border-t pt-2 text-[11px] text-muted-foreground"><span className="sr-only">Changer le statut de {item.key}</span><select aria-label={`Changer le statut de ${item.key}`} value={item.status} disabled={movingId === item.id} onChange={(event) => void move(item, event.target.value as WorkItemStatus)} className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"><option value={item.status}>{statusLabels[item.status]}</option>{allowedTransitions[item.status].map((next) => <option key={next} value={next}>{statusLabels[next]}</option>)}</select></label> : null}
        </li>)}</ul>
      </section>;
    })}</div>
  </div>;
}
