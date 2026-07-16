"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateAgentTeamForm({
  endpoint,
  agents,
}: {
  endpoint: string;
  agents: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [leadAgentId, setLeadAgentId] = useState(agents[0]?.id ?? "");
  const [memberAgentIds, setMemberAgentIds] = useState<string[]>([]);
  const [concurrencyLimit, setConcurrencyLimit] = useState(1);
  const [autoDelegatePlanSteps, setAutoDelegatePlanSteps] = useState(false);
  if (!open)
    return (
      <Button
        type="button"
        variant="outline"
        disabled={!agents.length}
        onClick={() => setOpen(true)}
      >
        <PlusIcon />
        Nouvelle équipe
      </Button>
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          leadAgentId,
          memberAgentIds,
          concurrencyLimit,
          delegationPolicy: { autoDelegatePlanSteps },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        return toast.error(data.error ?? "Création impossible.");
      setName("");
      setMemberAgentIds([]);
      setConcurrencyLimit(1);
      setAutoDelegatePlanSteps(false);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_8rem]">
        <div className="space-y-2">
          <Label htmlFor="team-name">Nom de l’équipe</Label>
          <Input
            id="team-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Équipe produit"
          />
        </div>
        <div className="space-y-2">
          <Label>Agent lead</Label>
          <Select value={leadAgentId} onValueChange={setLeadAgentId}>
            <SelectTrigger aria-label="Agent lead">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-concurrency">Concurrence</Label>
          <Input
            id="team-concurrency"
            type="number"
            min={1}
            max={64}
            value={concurrencyLimit}
            onChange={(event) =>
              setConcurrencyLimit(
                Math.min(64, Math.max(1, Number(event.target.value) || 1)),
              )
            }
          />
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Membres</legend>
        <p className="mt-1 text-xs text-muted-foreground">
          Le lead est toujours membre. Ajoutez les autres agents disponibles
          pour la chaîne de délégation.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {agents
            .filter((agent) => agent.id !== leadAgentId)
            .map((agent) => (
              <label
                key={agent.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={memberAgentIds.includes(agent.id)}
                  onCheckedChange={(checked) =>
                    setMemberAgentIds((current) =>
                      checked === true
                        ? [...new Set([...current, agent.id])]
                        : current.filter((id) => id !== agent.id),
                    )
                  }
                />
                {agent.name}
              </label>
            ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-3 text-sm">
        <Checkbox
          checked={autoDelegatePlanSteps}
          onCheckedChange={(checked) =>
            setAutoDelegatePlanSteps(checked === true)
          }
        />
        <span>
          <span className="block font-medium">
            Déléguer automatiquement les étapes planifiées
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Les étapes encore en attente deviennent des runs enfants ciblant les
            profils membres. Aucune tâche métier n’est créée.
          </span>
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Fermer
        </Button>
        <Button
          type="submit"
          disabled={pending || !name.trim() || !leadAgentId}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null}Créer
        </Button>
      </div>
    </form>
  );
}
