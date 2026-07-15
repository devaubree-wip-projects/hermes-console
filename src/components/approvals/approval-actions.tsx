"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ApprovalActions({
  approvalId,
  taskId,
  chatBase,
}: {
  approvalId: string;
  taskId: string | null;
  chatBase?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setPending(decision);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Impossible de traiter cette validation.");
        return;
      }

      if (decision === "approved") {
        toast.success("Approuvée — la tâche peut être exécutée.", {
          action: taskId
            ? {
                label: "Exécuter",
                onClick: async () => {
                  const runRes = await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
                  const runData = await runRes.json();
                  if (!runRes.ok) {
                    toast.error(runData.error ?? "Impossible d’exécuter la tâche.");
                    return;
                  }
                  const base = chatBase ?? "/d/chat";
                  router.push(`${base}/${runData.sessionId}?autostart=1`);
                },
              }
            : undefined,
        });
      } else {
        toast.success("Refusée.");
      }

      router.refresh();
    } catch {
      toast.error("Erreur réseau — réessayez.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        className="h-11"
        disabled={pending !== null}
        onClick={() => decide("approved")}
      >
        {pending === "approved" && <Loader2 className="size-4 animate-spin" />}
        Approuver
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending !== null}
        onClick={() => decide("rejected")}
      >
        {pending === "rejected" && <Loader2 className="size-4 animate-spin" />}
        Refuser
      </Button>
    </div>
  );
}
