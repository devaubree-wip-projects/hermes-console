"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function CreateWorkItemForm({
  apiBase,
  taskBase,
  agents,
  teams,
  projects,
}: {
  apiBase: string;
  taskBase: string;
  agents: Array<{ id: string; name: string; ready: boolean }>;
  teams: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("backlog");
  const [projectId, setProjectId] = useState("none");
  const [priority, setPriority] = useState("none");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          reviewPolicy: "optional",
          priority,
          projectId: projectId === "none" ? null : projectId,
          assignee: agentId === "backlog" ? undefined : agentId.startsWith("team:")
            ? { type: "team", teamId: agentId.slice(5) }
            : { type: "agent", agentId: agentId.replace(/^agent:/, "") },
          enqueue: agentId !== "backlog",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Impossible de créer la tâche.");
        return;
      }
      toast.success(data.run ? "Tâche créée et envoyée à Hermes." : "Tâche ajoutée au backlog.");
      router.push(`${taskBase}/${data.item.id}`);
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return <Button type="button" onClick={() => setExpanded(true)}><PlusIcon />Nouvelle tâche</Button>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="work-title">Résultat attendu</Label>
          <Input id="work-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} autoFocus placeholder="Ex. Auditer la configuration de production" disabled={submitting} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
          <div className="space-y-2"><Label htmlFor="work-project">Projet</Label><Select value={projectId} onValueChange={setProjectId} disabled={submitting}><SelectTrigger id="work-project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Aucun projet</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="work-priority">Priorité</Label><Select value={priority} onValueChange={setPriority} disabled={submitting}><SelectTrigger id="work-priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sans priorité</SelectItem><SelectItem value="low">Basse</SelectItem><SelectItem value="medium">Moyenne</SelectItem><SelectItem value="high">Haute</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent></Select></div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="work-description">Contexte et critères de réussite</Label>
          <Textarea id="work-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={40_000} placeholder="Décrivez les livrables, contraintes et ressources utiles." disabled={submitting} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="work-agent">Assignation</Label>
          <Select value={agentId} onValueChange={setAgentId} disabled={submitting}>
            <SelectTrigger id="work-agent"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="backlog">Backlog, non assignée</SelectItem>
              {agents.map((agent) => <SelectItem key={agent.id} value={`agent:${agent.id}`} disabled={!agent.ready}>{agent.name}{agent.ready ? "" : " (runtime indisponible)"}</SelectItem>)}
              {teams.map((team) => <SelectItem key={team.id} value={`team:${team.id}`}>Équipe · {team.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Une assignation à un agent crée un run durable. Vous pouvez fermer cet onglet sans interrompre Hermes.
        </p>
        <div className="mt-auto flex gap-2">
          <Button type="submit" disabled={submitting || !title.trim()}>{submitting ? <Loader2Icon className="animate-spin" /> : null}Créer</Button>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => setExpanded(false)}>Fermer</Button>
        </div>
      </div>
    </form>
  );
}
