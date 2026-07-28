"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Closes the deliverable-review loop: a task left in `review` by a
 * reviewPolicy=required run can be approved (-> done) or sent back for changes
 * (-> in_progress). Both hit the existing PATCH /work-items/[id] endpoint.
 */
export function ReviewActions({
  endpoint,
  onChanged,
}: {
  endpoint: string;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<null | "done" | "in_progress">(null);

  async function decide(status: "done" | "in_progress") {
    setPending(status);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Action impossible.");
        return;
      }
      toast.success(status === "done" ? "Livrable approuvé." : "Renvoyé pour corrections.");
      if (onChanged) onChanged();
      else router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={pending !== null} onClick={() => decide("done")}>
        {pending === "done" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Approuver
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => decide("in_progress")}
      >
        {pending === "in_progress" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
        Renvoyer
      </Button>
    </div>
  );
}
