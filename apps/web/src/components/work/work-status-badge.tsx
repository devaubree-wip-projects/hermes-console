import { Badge } from "@/components/ui/badge";
import type { WorkItemStatus, WorkRunStatus } from "@/db/schema";

const ITEM_LABELS: Record<WorkItemStatus, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  review: "En revue",
  done: "Terminée",
  cancelled: "Annulée",
};

const RUN_LABELS: Record<WorkRunStatus, string> = {
  queued: "En file",
  preparing: "Préparation",
  running: "En cours",
  waiting_input: "Intervention requise",
  cancelling: "Annulation",
  succeeded: "Réussi",
  failed: "Échoué",
  cancelled: "Annulé",
};

function stateClass(status: WorkItemStatus | WorkRunStatus) {
  if (status === "done" || status === "succeeded") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (status === "blocked" || status === "failed") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "review" || status === "waiting_input") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (status === "in_progress" || status === "running" || status === "preparing") return "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400";
  return "";
}

export function WorkItemStatusBadge({ status }: { status: WorkItemStatus }) {
  return <Badge variant="outline" className={stateClass(status)}>{ITEM_LABELS[status]}</Badge>;
}

export function WorkRunStatusBadge({ status }: { status: WorkRunStatus }) {
  return <Badge variant="outline" className={stateClass(status)}>{RUN_LABELS[status]}</Badge>;
}
