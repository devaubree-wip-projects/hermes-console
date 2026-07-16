"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function InboxActions({ endpoint, disabled }: { endpoint: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function markAll() {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Impossible de mettre l’Inbox à jour.");
    } finally {
      setPending(false);
    }
  }
  return <Button type="button" variant="outline" disabled={disabled || pending} onClick={markAll}>{pending ? <Loader2Icon className="animate-spin" /> : <CheckCheckIcon />}Tout marquer comme lu</Button>;
}
