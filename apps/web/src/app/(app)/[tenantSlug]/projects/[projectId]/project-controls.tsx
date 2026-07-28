"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectStatus } from "@/db/schema";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planifié",
  active: "Actif",
  paused: "En pause",
  completed: "Terminé",
  cancelled: "Annulé",
};

export function ProjectControls({
  tenantSlug,
  projectId,
  name: initialName,
  status,
}: {
  tenantSlug: string;
  projectId: string;
  name: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const endpoint = `/api/${tenantSlug}/projects/${projectId}`;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) { toast.error(data.error ?? "Mise à jour impossible."); return false; }
      router.refresh();
      return true;
    } catch { toast.error("La Console est momentanément inaccessible."); return false; }
    finally { setPending(false); }
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (await patch({ name })) setEditing(false);
  }

  async function remove() {
    if (!window.confirm("Supprimer ce projet ? Les tâches liées seront détachées, pas supprimées.")) return;
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "Suppression impossible.");
        return;
      }
      router.push(`/${tenantSlug}/projects`);
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <form onSubmit={rename} className="flex items-center gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} className="h-8 w-48" autoFocus />
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>{pending ? <Loader2Icon className="animate-spin" /> : null}Enregistrer</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setName(initialName); }}>Annuler</Button>
        </form>
      ) : (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}><PencilIcon />Renommer</Button>
      )}
      <Select value={status} disabled={pending} onValueChange={(value) => patch({ status: value })}>
        <SelectTrigger className="h-8 w-36" aria-label="Statut du projet"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label="Supprimer le projet" onClick={remove}><Trash2Icon className="text-destructive" />Supprimer</Button>
    </div>
  );
}
