"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AssignOptions = {
  agents: Array<{ id: string; name: string; ready: boolean }>;
  teams: Array<{ id: string; name: string }>;
};

type CurrentAssignee = {
  type: "user" | "agent" | "team" | null;
  agentId: string | null;
  teamId: string | null;
  userId: string | null;
  label?: string | null;
};

function currentValue(current: CurrentAssignee) {
  if (current.type === "agent" && current.agentId) return `agent:${current.agentId}`;
  if (current.type === "team" && current.teamId) return `team:${current.teamId}`;
  if (current.type === "user" && current.userId) return `user:${current.userId}`;
  return "backlog";
}

function toAssignee(value: string): {
  type: "user" | "agent" | "team" | null;
  userId?: string;
  agentId?: string;
  teamId?: string;
} {
  if (value === "backlog") return { type: null };
  if (value.startsWith("agent:")) return { type: "agent", agentId: value.slice(6) };
  if (value.startsWith("team:")) return { type: "team", teamId: value.slice(5) };
  return { type: "user", userId: value.slice(5) };
}

export function AssignWorkItemControl({ endpoint, options, current, onChanged }: {
  endpoint: string;
  options: AssignOptions;
  current: CurrentAssignee;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => currentValue(current));
  const [submitting, setSubmitting] = useState(false);

  async function assign(next: string) {
    const previous = value;
    setValue(next);
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toAssignee(next)),
      });
      const data = await response.json();
      if (!response.ok) {
        setValue(previous);
        toast.error(data.error ?? "Assignation impossible.");
        return;
      }
      toast.success(data.run ? "Assignée — run envoyé à Hermes." : "Assignation mise à jour.");
      if (onChanged) onChanged();
      else router.refresh();
    } catch {
      setValue(previous);
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="assign-work-item" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Assignation</Label>
      <Select value={value} onValueChange={assign} disabled={submitting}>
        <SelectTrigger id="assign-work-item"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="backlog">Backlog, non assignée</SelectItem>
          {current.type === "user" && current.userId ? (
            <SelectItem value={`user:${current.userId}`} disabled>
              Membre · {current.label ?? "assignation humaine"}
            </SelectItem>
          ) : null}
          {options.agents.map((agent) => <SelectItem key={agent.id} value={`agent:${agent.id}`} disabled={!agent.ready}>{agent.name}{agent.ready ? "" : " (runtime indisponible)"}</SelectItem>)}
          {options.teams.map((team) => <SelectItem key={team.id} value={`team:${team.id}`}>Équipe · {team.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {submitting ? <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2Icon className="size-3 animate-spin" />Mise à jour…</p> : null}
    </div>
  );
}
