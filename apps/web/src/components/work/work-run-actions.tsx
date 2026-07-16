"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function WorkRunActions({
  apiBase,
  workItemId,
  runId,
  active,
  canRun,
}: {
  apiBase: string;
  workItemId: string;
  runId?: string | null;
  active: boolean;
  canRun: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function request(path: string, body?: unknown) {
    setPending(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Action impossible.");
        return;
      }
      toast.success(active ? "Annulation transmise à l’Edge." : "Nouveau run ajouté à la file.");
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setPending(false);
    }
  }

  if (active && runId) {
    return <Button type="button" variant="outline" disabled={pending} onClick={() => request(`${apiBase}/work-runs/${runId}/cancel`)}>{pending ? <Loader2Icon className="animate-spin" /> : <SquareIcon />}Annuler le run</Button>;
  }
  if (canRun) {
    return <Button type="button" disabled={pending} onClick={() => request(`${apiBase}/work-items/${workItemId}/runs`, { triggerType: "rerun" })}>{pending ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}Relancer</Button>;
  }
  return null;
}
