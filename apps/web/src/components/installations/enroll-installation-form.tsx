"use client";

import { useState } from "react";
import { CopyIcon, KeyRoundIcon, Loader2Icon, RadioTowerIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Enrollment = {
  token: string;
  expiresAt: string;
  exchangeUrl: string;
  relayUrl: string;
};

export function EnrollInstallationForm({ endpoint }: { endpoint: string }) {
  const [pending, setPending] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const command = enrollment
    ? `hermes-gateway enroll --url ${JSON.stringify(enrollment.exchangeUrl)} --token ${JSON.stringify(enrollment.token)} --identity-dir /var/lib/hermes-console/identity`
    : "";

  if (enrollment) {
    return <div className="grid gap-3" data-testid="relay-enrollment-result">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Jeton affiché une seule fois</p>
        <p className="mt-1 text-xs">Expire le {new Date(enrollment.expiresAt).toLocaleString("fr-FR")}. Il ne sera jamais stocké en clair.</p>
      </div>
      <Label htmlFor="enrollment-command">Commande à exécuter à côté de Hermes</Label>
      <textarea className="min-h-28 rounded-lg border bg-muted p-3 font-mono text-xs" id="enrollment-command" readOnly value={command} />
      <p className="break-all text-xs text-muted-foreground">Tunnel sortant mTLS vers {enrollment.relayUrl}</p>
      <Button onClick={async () => {
        await navigator.clipboard.writeText(command);
        toast.success("Commande copiée.");
      }} type="button" variant="outline"><CopyIcon />Copier la commande</Button>
      <Button onClick={() => setEnrollment(null)} type="button" variant="ghost">Créer un autre enrôlement</Button>
    </div>;
  }

  return <form className="grid gap-4" onSubmit={async (event) => {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${endpoint}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), installationKey: form.get("installationKey") }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; enrollment?: Enrollment };
    setPending(false);
    if (!response.ok || !payload.enrollment) {
      toast.error(payload.error ?? "Enrôlement impossible.");
      return;
    }
    setEnrollment(payload.enrollment);
    toast.success("Jeton d’enrôlement créé.");
  }}>
    <div className="grid gap-2">
      <Label htmlFor="relay-installation-name">Nom</Label>
      <Input id="relay-installation-name" name="name" placeholder="VPS sans port entrant" required />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="relay-installation-key">Clé d’installation</Label>
      <Input id="relay-installation-key" name="installationKey" placeholder="vps-production" required />
    </div>
    <p className="text-xs text-muted-foreground">Le Edge générera sa clé privée localement puis ouvrira uniquement une connexion sortante chiffrée vers le Relay.</p>
    <Button disabled={pending} type="submit">
      {pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
      Générer le jeton court
      <RadioTowerIcon className="ml-auto" />
    </Button>
  </form>;
}
