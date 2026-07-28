import type { TaskDetailData, TaskTimeline } from "@/components/work/task-detail-view";

type TaskDetailCacheEntry = {
  detail?: TaskDetailData;
  timeline?: TaskTimeline;
  detailRequest?: Promise<TaskDetailData>;
  timelineRequest?: Promise<TaskTimeline>;
};

const taskDetailCache = new Map<string, TaskDetailCacheEntry>();

function cacheKey(apiBase: string, taskId: string) {
  return `${apiBase}/work-items/${encodeURIComponent(taskId)}`;
}

function entryFor(apiBase: string, taskId: string) {
  const key = cacheKey(apiBase, taskId);
  const existing = taskDetailCache.get(key);
  if (existing) return existing;
  const entry: TaskDetailCacheEntry = {};
  taskDetailCache.set(key, entry);
  return entry;
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? fallback);
  }
  return payload as T;
}

export function readCachedTaskDetail(apiBase: string, taskId: string, minimumUpdatedAt?: Date | string) {
  const entry = taskDetailCache.get(cacheKey(apiBase, taskId));
  if (!entry?.detail || !minimumUpdatedAt) return entry?.detail;
  if (new Date(entry.detail.item.updatedAt).getTime() >= new Date(minimumUpdatedAt).getTime()) return entry.detail;
  entry.detail = undefined;
  entry.timeline = undefined;
  return undefined;
}

export function readCachedTaskTimeline(apiBase: string, taskId: string) {
  return taskDetailCache.get(cacheKey(apiBase, taskId))?.timeline;
}

export function invalidateTaskDetail(apiBase: string, taskId: string) {
  const entry = taskDetailCache.get(cacheKey(apiBase, taskId));
  if (!entry) return;
  entry.detail = undefined;
  entry.timeline = undefined;
}

export function fetchTaskDetail(apiBase: string, taskId: string, options?: { force?: boolean }) {
  const entry = entryFor(apiBase, taskId);
  if (!options?.force && entry.detail) return Promise.resolve(entry.detail);
  if (entry.detailRequest) return entry.detailRequest;

  const request = fetch(`${cacheKey(apiBase, taskId)}?runLimit=200`)
    .then((response) => responseJson<TaskDetailData>(response, "Impossible de charger la tâche."))
    .then((detail) => {
      entry.detail = detail;
      return detail;
    })
    .finally(() => {
      if (entry.detailRequest === request) entry.detailRequest = undefined;
    });
  entry.detailRequest = request;
  return request;
}

export function fetchTaskTimeline(apiBase: string, taskId: string, options?: { force?: boolean }) {
  const entry = entryFor(apiBase, taskId);
  if (!options?.force && entry.timeline) return Promise.resolve(entry.timeline);
  if (entry.timelineRequest) return entry.timelineRequest;

  const request = fetch(`${cacheKey(apiBase, taskId)}/timeline?limit=200`)
    .then((response) => responseJson<{ timeline: TaskTimeline }>(response, "Impossible de charger l’activité."))
    .then(({ timeline }) => {
      entry.timeline = timeline;
      return timeline;
    })
    .finally(() => {
      if (entry.timelineRequest === request) entry.timelineRequest = undefined;
    });
  entry.timelineRequest = request;
  return request;
}

export function prefetchTaskDetail(apiBase: string, taskId: string) {
  return Promise.allSettled([
    fetchTaskDetail(apiBase, taskId),
    fetchTaskTimeline(apiBase, taskId),
  ]);
}
