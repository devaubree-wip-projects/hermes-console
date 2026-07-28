"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleIcon,
  InfoIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { presentEvent, type EventTone } from "@/lib/events/presentation";

export type EventLogTableRow = {
  id: string;
  action: string;
  targetType: string;
  metadata: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
};

const tonePresentation = {
  neutral: { label: "Information", variant: "secondary", icon: CircleIcon },
  info: { label: "Activité", variant: "outline", icon: InfoIcon },
  success: { label: "Réussi", variant: "success", icon: CheckCircle2Icon },
  warning: { label: "Attention", variant: "warning", icon: AlertTriangleIcon },
  error: { label: "Échec", variant: "destructive", icon: AlertTriangleIcon },
} as const satisfies Record<EventTone, {
  label: string;
  variant: "secondary" | "outline" | "success" | "warning" | "destructive";
  icon: typeof CircleIcon;
}>;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const pageSizes = [10, 15, 25, 50] as const;

function targetLabel(targetType: string) {
  const labels: Record<string, string> = {
    agent: "Agent",
    agent_session: "Conversation",
    runtime_installation: "Installation",
    workspace: "Organisation",
  };
  return labels[targetType] ?? targetType.replaceAll("_", " ");
}

export function EventLogsDataTable({ events }: { events: EventLogTableRow[] }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(15);
  const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageEvents = useMemo(
    () => events.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [currentPage, events, pageSize],
  );
  const firstRow = events.length ? currentPage * pageSize + 1 : 0;
  const lastRow = Math.min((currentPage + 1) * pageSize, events.length);

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <Table>
        <TableHeader className="bg-muted/45">
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-80 pl-4">Événement</TableHead>
            <TableHead>État</TableHead>
            <TableHead>Acteur</TableHead>
            <TableHead>Cible</TableHead>
            <TableHead className="pr-4 text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageEvents.length ? pageEvents.map((row) => {
            const event = presentEvent(row.action, row.metadata);
            const tone = tonePresentation[event.tone];
            const ToneIcon = tone.icon;
            return (
              <TableRow key={row.id}>
                <TableCell className="pl-4 whitespace-normal">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ToneIcon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{event.label}</p>
                      {event.detail ? (
                        <p className="mt-0.5 max-w-xl break-words text-xs text-muted-foreground">{event.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant={tone.variant}>{tone.label}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{row.actorName ?? "Hermes Console"}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{targetLabel(row.targetType)}</TableCell>
                <TableCell className="pr-4 text-right text-xs tabular-nums text-muted-foreground">
                  <time dateTime={row.createdAt}>{dateFormatter.format(new Date(row.createdAt))}</time>
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow className="hover:bg-transparent">
              <TableCell className="h-40 text-center text-muted-foreground" colSpan={5}>
                Aucun événement pour le moment.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs tabular-nums text-muted-foreground">
          {firstRow}–{lastRow} sur {events.length} événement{events.length > 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Lignes par page
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPageIndex(0);
              }}
            >
              <SelectTrigger aria-label="Lignes par page" className="w-18" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {pageSizes.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <span className="min-w-20 text-center text-xs tabular-nums text-muted-foreground">
            Page {currentPage + 1} sur {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Première page"
              disabled={currentPage === 0}
              onClick={() => setPageIndex(0)}
              size="icon-sm"
              variant="outline"
            >
              <ChevronsLeftIcon />
            </Button>
            <Button
              aria-label="Page précédente"
              disabled={currentPage === 0}
              onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
              size="icon-sm"
              variant="outline"
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              aria-label="Page suivante"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPageIndex((page) => Math.min(pageCount - 1, page + 1))}
              size="icon-sm"
              variant="outline"
            >
              <ChevronRightIcon />
            </Button>
            <Button
              aria-label="Dernière page"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPageIndex(pageCount - 1)}
              size="icon-sm"
              variant="outline"
            >
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
