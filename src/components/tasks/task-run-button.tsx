"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function TaskRunButton({
  taskId,
  workspaceId,
}: {
  taskId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Impossible d’exécuter la tâche.");
        setLoading(false);
        return;
      }
      router.push(`/w/${workspaceId}/chat/${data.sessionId}?autostart=1`);
    } catch {
      toast.error("Erreur réseau — réessayez.");
      setLoading(false);
    }
  }

  return (
    <Button type="button" className="h-11" disabled={loading} onClick={run}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      Exécuter
    </Button>
  );
}
