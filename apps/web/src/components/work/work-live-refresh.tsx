"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export type WorkChange = { workItemId?: string; source?: string };

export function WorkLiveRefresh({ endpoint, onChanged }: { endpoint: string; onChanged?: (change: WorkChange) => void }) {
  const router = useRouter();
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);
  useEffect(() => {
    const stream = new EventSource(endpoint);
    stream.addEventListener("work.changed", (event) => {
      let change: WorkChange = {};
      try { change = JSON.parse(event.data) as WorkChange; } catch { /* refresh conservatively */ }
      if (onChangedRef.current) onChangedRef.current(change);
      else router.refresh();
    });
    return () => stream.close();
  }, [endpoint, router]);
  return null;
}
