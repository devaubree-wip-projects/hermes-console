"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DangerZone({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const canDelete = confirmText.trim() === workspaceName;

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Échec de la suppression.");
      }
      toast.success("Workspace supprimé.");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la suppression.");
      setIsDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Zone de danger</CardTitle>
        <CardDescription>
          La suppression du workspace efface définitivement ses tâches, conversations, fichiers et
          validations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirmText("");
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" className="h-11">
              Supprimer ce workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer « {workspaceName} » ?</DialogTitle>
              <DialogDescription>
                Cette action est irréversible. Tapez « {workspaceName} » pour confirmer.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-workspace-name">Nom du workspace</Label>
              <Input
                id="confirm-workspace-name"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-11" disabled={isDeleting}>
                  Annuler
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                className="h-11"
                disabled={!canDelete || isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Supprimer définitivement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
