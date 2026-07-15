import { Badge } from "@/components/ui/badge";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/task-templates";

const STATUS_STYLES: Record<
  TaskStatus,
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  draft: { variant: "secondary" },
  waiting_approval: {
    variant: "outline",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  running: { variant: "default" },
  done: {
    variant: "outline",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  failed: { variant: "destructive" },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { variant, className } = STATUS_STYLES[status];
  return (
    <Badge variant={variant} className={className}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}
