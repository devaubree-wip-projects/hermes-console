"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, Loader2Icon, NetworkIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ConnectInstallationForm({
  endpoint,
  agents,
}: {
  endpoint: string;
  agents: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "none");
  const [status, setStatus] = useState<string | null>(null);
  const [managementLevel, setManagementLevel] = useState("external");
  const [profileName, setProfileName] = useState("");
  const [preflight, setPreflight] = useState<null | {
    status: string;
    statusDetail: string | null;
    hermesVersion: string | null;
    runtimeKind: string;
    lifecycle: string[];
    profiles: Array<{ name: string; description?: string; provider?: string | null; model?: string | null }>;
  }>(null);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        setPending(true);
        setStatus(null);
        const form = new FormData(formElement);
        const common = {
          gatewayUrl: form.get("gatewayUrl"),
          installationKey: form.get("installationKey"),
        };
        const response = await fetch(preflight ? endpoint : `${endpoint}/preflight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preflight ? {
            ...common,
            name: form.get("name"),
            agentId: agentId === "none" ? null : agentId,
            profileName: agentId === "none" ? null : profileName,
            managementLevel,
          } : common),
        });
        const payload = await response.json().catch(() => ({})) as {
          error?: string;
          preflight?: NonNullable<typeof preflight>;
        };
        setPending(false);
        if (!response.ok) {
          toast.error(payload.error || "Connexion impossible.");
          return;
        }
        if (!preflight && payload.preflight) {
          setPreflight(payload.preflight);
          setProfileName(payload.preflight.profiles[0]?.name ?? "");
          setManagementLevel("external");
          setStatus("Préflight terminé. Vérifiez les capacités avant de connecter l’installation.");
          return;
        }
        toast.success("Installation Hermes connectée.");
        setStatus("Installation Hermes connectée.");
        setPreflight(null);
        setProfileName("");
        formElement.reset();
        router.refresh();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="installation-name">Nom</Label>
        <Input id="installation-name" name="name" placeholder="VPS production" required />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="gateway-url">URL publique du Edge</Label>
          <Input id="gateway-url" name="gatewayUrl" onChange={() => setPreflight(null)} placeholder="https://hermes.example.com" required type="url" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="installation-key">Clé d’installation</Label>
          <Input id="installation-key" name="installationKey" onChange={() => setPreflight(null)} placeholder="vps-production" required />
        </div>
      </div>
      {preflight ? (
        <div className="grid gap-4 rounded-xl border bg-muted/30 p-4" data-testid="installation-preflight">
          <div className="flex items-start gap-3">
            <CheckCircle2Icon className="mt-0.5 size-5 text-emerald-600" />
            <div>
              <p className="font-medium">Edge vérifié</p>
              <p className="text-xs text-muted-foreground">
                Hermes {preflight.hermesVersion ?? "version inconnue"} · {preflight.runtimeKind} · {preflight.profiles.length} profil{preflight.profiles.length > 1 ? "s" : ""}
              </p>
              {preflight.statusDetail ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{preflight.statusDetail}</p> : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="installation-management">Niveau de gestion</Label>
            <Select onValueChange={setManagementLevel} value={managementLevel}>
              <SelectTrigger id="installation-management"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">Externe — utiliser et observer</SelectItem>
                {preflight.lifecycle.includes("restart") ? <SelectItem value="connected">Connectée — configurer et redémarrer</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
          {agentId !== "none" ? (
            <div className="grid gap-2">
              <Label htmlFor="installation-profile">Profil Hermes découvert</Label>
              <Select disabled={preflight.profiles.length === 0} onValueChange={setProfileName} value={profileName}>
                <SelectTrigger id="installation-profile"><SelectValue placeholder="Aucun profil disponible" /></SelectTrigger>
                <SelectContent>
                  {preflight.profiles.map((profile) => (
                    <SelectItem key={profile.name} value={profile.name}>
                      {profile.name}{profile.model ? ` · ${profile.model}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button onClick={() => { setPreflight(null); setStatus(null); }} type="button" variant="outline">
            <RotateCcwIcon /> Modifier la connexion
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="installation-agent">Agent à rattacher</Label>
        <Select onValueChange={setAgentId} value={agentId}>
          <SelectTrigger id="installation-agent"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun pour l’instant</SelectItem>
            {agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Le Edge doit déjà tourner à côté de Hermes. La console vérifie son protocole et n’accède jamais directement au port 9119.
      </p>
      {status ? <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{status}</p> : null}
      <Button disabled={pending || (Boolean(preflight) && agentId !== "none" && !profileName)} type="submit">
        {pending ? <Loader2Icon className="animate-spin" /> : <NetworkIcon />}
        {preflight ? "Connecter l’installation" : "Tester le Edge"}
      </Button>
    </form>
  );
}
