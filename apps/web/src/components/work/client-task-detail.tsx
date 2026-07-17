"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchTaskDetail,
  fetchTaskTimeline,
  readCachedTaskDetail,
  readCachedTaskTimeline,
} from "@/components/work/task-detail-cache";
import { TaskDetailLoading } from "@/components/work/task-detail-sheet";
import {
  TaskDetailView,
  taskDetailFromSeed,
  type TaskDetailData,
  type TaskDetailSeed,
  type TaskTimeline,
} from "@/components/work/task-detail-view";

export function ClientTaskDetail({ apiBase, workspaceBase, taskId, initialDetail, canEdit, onSelectTask }: {
  apiBase: string;
  workspaceBase: string;
  taskId: string;
  initialDetail?: TaskDetailSeed;
  canEdit: boolean;
  onSelectTask: (taskId: string) => void;
}) {
  const cachedDetail = readCachedTaskDetail(apiBase, taskId, initialDetail?.item.updatedAt);
  const [detail, setDetail] = useState<TaskDetailData | null>(() => cachedDetail ?? (initialDetail ? taskDetailFromSeed(initialDetail) : null));
  const [timeline, setTimeline] = useState<TaskTimeline | null>(() => readCachedTaskTimeline(apiBase, taskId) ?? null);
  const [hydrating, setHydrating] = useState(!cachedDetail);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    const detailRequest = fetchTaskDetail(apiBase, taskId, { force })
      .then((nextDetail) => {
        setDetail(nextDetail);
        setHydrating(false);
        setError(null);
      })
      .catch((loadError) => {
        setHydrating(false);
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger la tâche.");
      });
    const timelineRequest = fetchTaskTimeline(apiBase, taskId, { force })
      .then(setTimeline)
      .catch((loadError) => {
        setError((current) => current ?? (loadError instanceof Error ? loadError.message : "Impossible de charger l’activité."));
      });
    return Promise.allSettled([detailRequest, timelineRequest]);
  }, [apiBase, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail) {
    if (!error) return <TaskDetailLoading />;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertCircleIcon className="size-5" /></span>
        <div><h2 className="text-base font-semibold">Tâche indisponible</h2><p className="mt-1 text-sm text-muted-foreground">{error}</p></div>
        <Button type="button" variant="outline" onClick={() => void load(true)}><RefreshCwIcon />Réessayer</Button>
      </div>
    );
  }
  return (
    <TaskDetailView
      workspaceBase={workspaceBase}
      detail={detail}
      timeline={timeline}
      canEdit={canEdit}
      embedded
      hydrating={hydrating}
      onSelectTask={onSelectTask}
      onRefresh={() => void load(true)}
    />
  );
}
