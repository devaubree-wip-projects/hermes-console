"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2OffIcon, Loader2Icon, RefreshCwIcon, SaveIcon, ServerCogIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

async function patchInstallation(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Opération impossible.");
}

export function InstallationActions({
  endpoint,
  installation,
  lifecycle,
  profiles,
  agents,
}: {
  endpoint: string;
  installation: {
    name: string;
    origin: string;
    managementLevel: string;
    archivedAt: Date | null;
  };
  lifecycle: string[];
  profiles: Array<{ name: string; model?: string | null }>;
  agents: Array<{ id: string; name: string; installationId: string | null }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(installation.name);
  const [managementLevel, setManagementLevel] = useState(installation.managementLevel);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [profileName, setProfileName] = useState(profiles[0]?.name ?? "");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function run(key: string, body: Record<string, unknown>, success: string) {
    setPending(key);
    setError(null);
    try {
      await patchInstallation(endpoint, body);
      toast.success(success);
      setConfirmDisconnect(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opération impossible.");
    } finally {
      setPending(null);
    }
  }

  if (installation.archivedAt) {
    return <div className="grid gap-3">
      <Alert title="Installation déconnectée" variant="warning">
        Les données Hermes n’ont pas été supprimées. Un nouveau préflight est requis pour la reconnecter.
      </Alert>
      <Button disabled={Boolean(pending)} onClick={() => run("restore", { archived: false }, "Installation reconnectée.")}>
        {pending === "restore" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        Reconnecter et vérifier
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>;
  }

  return <div className="grid gap-6">
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run("save", { name, managementLevel }, "Installation mise à jour.");
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="installation-detail-name">Nom</Label>
        <Input id="installation-detail-name" maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="installation-detail-management">Niveau de gestion</Label>
        <Select onValueChange={setManagementLevel} value={managementLevel}>
          <SelectTrigger id="installation-detail-management"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="external">Externe</SelectItem>
            {lifecycle.includes("restart") ? <SelectItem value="connected">Connectée</SelectItem> : null}
            {installation.origin !== "remote_existing" ? <SelectItem value="managed">Managée</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      <Button disabled={Boolean(pending)} type="submit">
        {pending === "save" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
        Enregistrer
      </Button>
    </form>

    <div className="grid gap-3 border-t pt-5">
      <div><h3 className="font-medium">Associer un agent</h3><p className="text-xs text-muted-foreground">Le profil est forcé par l’Edge pour toutes ses requêtes.</p></div>
      <div className="grid gap-2">
        <Label htmlFor="installation-detail-agent">Agent de l’organisation</Label>
        <Select disabled={agents.length === 0} onValueChange={setAgentId} value={agentId}>
          <SelectTrigger id="installation-detail-agent"><SelectValue placeholder="Aucun agent" /></SelectTrigger>
          <SelectContent>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="installation-detail-profile">Profil découvert</Label>
        <Select disabled={profiles.length === 0} onValueChange={setProfileName} value={profileName}>
          <SelectTrigger id="installation-detail-profile"><SelectValue placeholder="Aucun profil" /></SelectTrigger>
          <SelectContent>{profiles.map((profile) => <SelectItem key={profile.name} value={profile.name}>{profile.name}{profile.model ? ` · ${profile.model}` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button
        disabled={Boolean(pending) || !agentId || !profileName}
        onClick={() => run("assign", { agentId, profileName }, "Agent associé à l’installation.")}
        type="button"
        variant="outline"
      >
        {pending === "assign" ? <Loader2Icon className="animate-spin" /> : <ServerCogIcon />}
        Associer
      </Button>
    </div>

    <div className="grid gap-3 border-t pt-5">
      <Button disabled={Boolean(pending)} onClick={() => run("refresh", { archived: false }, "Préflight actualisé.")} type="button" variant="outline">
        {pending === "refresh" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        Revérifier maintenant
      </Button>
      {confirmDisconnect ? (
        <Alert title="Confirmer la déconnexion" variant="warning">
          Aucun fichier ou profil Hermes ne sera supprimé. Les agents doivent avoir été réassignés.
          <div className="mt-3 flex gap-2">
            <Button className="bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-200" disabled={Boolean(pending)} onClick={() => run("disconnect", { archived: true }, "Installation déconnectée.")} type="button" variant="destructive">
              {pending === "disconnect" ? <Loader2Icon className="animate-spin" /> : <Link2OffIcon />}
              Confirmer
            </Button>
            <Button onClick={() => setConfirmDisconnect(false)} type="button" variant="outline">Annuler</Button>
          </div>
        </Alert>
      ) : (
        <Button className="bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-200" onClick={() => setConfirmDisconnect(true)} type="button" variant="destructive"><Link2OffIcon />Déconnecter</Button>
      )}
    </div>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
  </div>;
}
