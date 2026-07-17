"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Reusable destructive-confirmation dialog. Sends a DELETE to `endpoint`,
 * surfaces the server error message on failure, and refreshes on success.
 */
export function DeleteConfirmDialog({
  endpoint,
  title,
  description,
  confirmLabel = "Supprimer",
  trigger,
  successMessage,
}: {
  endpoint: string;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  trigger: ReactNode;
  successMessage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        return toast.error(data?.error ?? "Suppression impossible.");
      setOpen(false);
      if (successMessage) toast.success(successMessage);
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Annuler
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={remove}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
