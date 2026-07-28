"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateProjectForm({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  if (!open) return <Button type="button" onClick={() => setOpen(true)}><PlusIcon />Nouveau projet</Button>;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, key }) });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Création impossible.");
      setName(""); setKey(""); setOpen(false); router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="project-key">Clé</Label><Input id="project-key" value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} placeholder="OPS" maxLength={24} /></div><div className="space-y-2"><Label htmlFor="project-name">Nom</Label><Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Exploitation" maxLength={160} /></div><div className="flex gap-2"><Button type="submit" disabled={pending || !name.trim() || !key.trim()}>{pending ? <Loader2Icon className="animate-spin" /> : null}Créer</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button></div></form>;
}
