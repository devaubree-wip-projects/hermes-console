"use client";

import { type MouseEvent, type ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheckIcon, CheckIcon, Loader2Icon } from "lucide-react";
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

export function InboxItemRow({
  href,
  endpoint,
  id,
  read,
  children,
}: {
  href: string;
  endpoint: string;
  id: string;
  read: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function markReadOnNavigate() {
    if (read) return;
    // Best-effort: the user is already navigating away, don't block on it.
    void fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
      keepalive: true,
    });
  }

  async function markReadInPlace(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Impossible de marquer cet élément comme lu.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2 hover:bg-muted/40">
      <Link href={href} onClick={markReadOnNavigate} className="flex min-w-0 flex-1 gap-3 px-4 py-4">
        {children}
      </Link>
      {read ? null : (
        <button
          type="button"
          onClick={markReadInPlace}
          disabled={pending}
          aria-label="Marquer comme lu"
          className="mr-4 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
        </button>
      )}
    </div>
  );
}
