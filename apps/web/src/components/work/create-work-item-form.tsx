"use client";

import { useState } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const isDev = process.env.NODE_ENV === "development";

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("backlog");
  const [projectId, setProjectId] = useState("none");
  const [priority, setPriority] = useState("none");

  function autofillDev() {
    const readyAgent = agents.find((agent) => agent.ready) ?? agents[0];
    setTitle(`Tâche dev ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
    setDescription(
      "Livrable : résumé actionnable en 3 points.\nContraintes : pas d'outil externe, rester factuel.\nCritère de succès : réponse courte et vérifiable.",
    );
    setAgentId(readyAgent ? `agent:${readyAgent.id}` : "backlog");
    setProjectId(projects[0]?.id ?? "none");
    setPriority("medium");
  }

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
      window.location.assign(`${taskBase}?task=${encodeURIComponent(data.item.id)}`);
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={expanded} onOpenChange={(open) => !submitting && setExpanded(open)}>
      <DialogTrigger asChild>
        <Button type="button"><PlusIcon />Nouvelle tâche</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] w-[calc(100vw-2rem)] flex-col sm:max-w-[54rem]">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche</DialogTitle>
          <DialogDescription>
            Définissez le résultat attendu puis laissez la tâche au backlog ou confiez-la à Hermes.
          </DialogDescription>
        </DialogHeader>
        <form id="create-work-item" onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="work-title">
              Résultat attendu
              <RequiredMark />
            </Label>
            <Input
              id="work-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={240}
              required
              placeholder="Ex. Auditer la configuration de production"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="work-project">Projet</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={submitting}>
                <SelectTrigger id="work-project"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun projet</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-priority">Priorité</Label>
              <Select value={priority} onValueChange={setPriority} disabled={submitting}>
                <SelectTrigger id="work-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sans priorité</SelectItem>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-agent">Assignation</Label>
              <Select value={agentId} onValueChange={setAgentId} disabled={submitting}>
                <SelectTrigger id="work-agent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog, non assignée</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={`agent:${agent.id}`} disabled={!agent.ready}>
                      {agent.name}
                      {agent.ready ? "" : " (runtime indisponible)"}
                    </SelectItem>
                  ))}
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={`team:${team.id}`}>Équipe · {team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <Label htmlFor="work-description">Contexte et critères de réussite</Label>
            <Textarea
              id="work-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={10}
              className="min-h-[14rem] flex-1 resize-y"
              maxLength={40_000}
              placeholder="Décrivez les livrables, contraintes et ressources utiles."
              disabled={submitting}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Assignez un agent ou une équipe pour lancer un run Hermes. Vous pouvez fermer cet onglet sans interrompre l&apos;exécution.
            </p>
          </div>
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {isDev ? (
              <Button type="button" variant="outline" disabled={submitting} onClick={autofillDev}>
                Autofill
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setExpanded(false)}>
              Annuler
            </Button>
            <Button type="submit" form="create-work-item" disabled={submitting || !title.trim()}>
              {submitting ? <Loader2Icon className="animate-spin" /> : null}
              Créer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
