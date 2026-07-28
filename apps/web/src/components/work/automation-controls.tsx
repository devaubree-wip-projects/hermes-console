"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PauseIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateAutomationForm({ endpoint, agents }: { endpoint: string; agents: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  if (!open) return <Button type="button" disabled={!agents.length} onClick={() => setOpen(true)}><PlusIcon />Nouvelle automatisation</Button>;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, triggerType: "manual", triggerConfig: {}, timezone: "Europe/Paris", workItemTemplate: { title, description: `Créée par l’automatisation ${name}.` }, assignee: { type: "agent", agentId }, active: true }) });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Création impossible.");
      setOpen(false); setName(""); setTitle(""); router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_13rem_auto] lg:items-end"><div className="space-y-2"><Label htmlFor="automation-name">Nom</Label><Input id="automation-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Audit hebdomadaire" /></div><div className="space-y-2"><Label htmlFor="automation-title">Tâche créée</Label><Input id="automation-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Auditer les services" /></div><div className="space-y-2"><Label>Agent</Label><Select value={agentId} onValueChange={setAgentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent></Select></div><div className="flex gap-2"><Button type="submit" disabled={pending || !name.trim() || !title.trim() || !agentId}>{pending ? <Loader2Icon className="animate-spin" /> : null}Créer</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button></div></form>;
}

export function RunAutomationButton({ endpoint, taskBase }: { endpoint: string; taskBase: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Exécution impossible.");
      router.push(`${taskBase}?task=${encodeURIComponent(data.item.id)}`, { scroll: false });
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  return <Button type="button" size="sm" variant="outline" disabled={pending} onClick={run}>{pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}Exécuter</Button>;
}

export function AutomationRowControls({ endpoint, status }: { endpoint: string; status: "active" | "inactive" | "error" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    try {
      const nextStatus = status === "active" ? "inactive" : "active";
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Mise à jour impossible.");
      router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  async function remove() {
    if (!window.confirm("Supprimer cette automatisation ?")) return;
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) { const data = await response.json().catch(() => ({})); toast.error(data.error ?? "Suppression impossible."); return; }
      router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  return <div className="flex gap-2">
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={toggle}>{pending ? <Loader2Icon className="animate-spin" /> : status === "active" ? <PauseIcon /> : <PlayIcon />}{status === "active" ? "Mettre en pause" : "Activer"}</Button>
    <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label="Supprimer l’automatisation" onClick={remove}><Trash2Icon className="text-destructive" /></Button>
  </div>;
}
