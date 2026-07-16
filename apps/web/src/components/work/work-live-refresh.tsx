"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function WorkLiveRefresh({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  useEffect(() => {
    const stream = new EventSource(endpoint);
    stream.addEventListener("work.changed", () => router.refresh());
    return () => stream.close();
  }, [endpoint, router]);
  return null;
}
