"use client";

import { useState } from "react";
import { ActivityIcon, ArchiveIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlayIcon, RotateCcwIcon, SaveIcon, ShieldCheckIcon, SquareIcon, Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function eurosToMicros(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1_000_000) : undefined;
}

export function InstallationOperations({ endpoint, lifecycle, profiles, managementLevel, canManage }: {
  endpoint: string;
  lifecycle: string[];
  profiles: string[];
  managementLevel: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [profile, setProfile] = useState(profiles[0] ?? "default");
  async function run(type: string) {
    const requiresConfirmation = ["restart", "stop", "drain"].includes(type);
    if (requiresConfirmation && confirmation !== type) {
      setConfirmation(type);
      return;
    }
    setPending(type);
    const response = await fetch(`${endpoint}/operations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, profile, confirmed: requiresConfirmation }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(null);
    setConfirmation(null);
    if (!response.ok) { toast.error(payload.error ?? "Opération impossible."); return; }
    toast.success(type === "collect_capacity" ? "Capacité actualisée." : `Opération ${type} terminée.`);
    router.refresh();
  }
  return <div className="grid gap-3">
    {profiles.length ? <div className="grid gap-2"><Label htmlFor="operation-profile">Profil cible</Label><Select onValueChange={setProfile} value={profile}><SelectTrigger id="operation-profile"><SelectValue /></SelectTrigger><SelectContent>{profiles.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div> : null}
    <div className="flex flex-wrap gap-2">
      <Button disabled={Boolean(pending)} onClick={() => run("collect_capacity")} type="button" variant="outline">{pending === "collect_capacity" ? <Loader2Icon className="animate-spin" /> : <ActivityIcon />}Collecter la capacité</Button>
      {canManage && managementLevel !== "external" && lifecycle.includes("start") ? <Button disabled={Boolean(pending)} onClick={() => run("start")} type="button" variant="outline"><PlayIcon />Démarrer</Button> : null}
      {canManage && managementLevel !== "external" && lifecycle.includes("restart") ? <Button disabled={Boolean(pending)} onClick={() => run("restart")} type="button" variant={confirmation === "restart" ? "destructive" : "outline"}><RotateCcwIcon />{confirmation === "restart" ? "Confirmer le redémarrage" : "Redémarrer"}</Button> : null}
      {canManage && managementLevel !== "external" && lifecycle.includes("drain") ? <Button disabled={Boolean(pending)} onClick={() => run("drain")} type="button" variant={confirmation === "drain" ? "destructive" : "outline"}>{confirmation === "drain" ? "Confirmer le drain" : "Drainer"}</Button> : null}
      {canManage && managementLevel !== "external" && lifecycle.includes("resume") ? <Button disabled={Boolean(pending)} onClick={() => run("resume")} type="button" variant="outline">Reprendre</Button> : null}
      {canManage && managementLevel !== "external" && lifecycle.includes("stop") ? <Button disabled={Boolean(pending)} onClick={() => run("stop")} type="button" variant={confirmation === "stop" ? "destructive" : "outline"}><SquareIcon />{confirmation === "stop" ? "Confirmer l’arrêt" : "Arrêter"}</Button> : null}
    </div>
  </div>;
}

export function InstallationBudgetForm({ endpoint, budget }: {
  endpoint: string;
  budget: null | {
    currency: string; infrastructureLimitMicros: number | null; inferenceLimitMicros: number | null;
    globalLimitMicros: number | null; alertThresholdPercent: number; hardCapAction: string;
    fallbackModel: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [currency, setCurrency] = useState(budget?.currency ?? "EUR");
  const [hardCapAction, setHardCapAction] = useState(budget?.hardCapAction ?? "owner_approval");
  const display = (value: number | null | undefined) => value === null || value === undefined ? "" : String(value / 1_000_000);
  return <form className="grid gap-3" onSubmit={async (event) => {
    event.preventDefault(); setPending(true);
    const form = new FormData(event.currentTarget);
    const values = ["infrastructureLimitMicros", "inferenceLimitMicros", "globalLimitMicros"] as const;
    const body: Record<string, unknown> = { currency, hardCapAction, fallbackModel: form.get("fallbackModel"), alertThresholdPercent: Number(form.get("threshold")) };
    for (const key of values) {
      const value = eurosToMicros(String(form.get(key) ?? ""));
      if (value === undefined) { toast.error("Montant de budget invalide."); setPending(false); return; }
      body[key] = value;
    }
    const response = await fetch(`${endpoint}/budget`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(false);
    if (!response.ok) { toast.error(payload.error ?? "Budget impossible à enregistrer."); return; }
    toast.success("Politique de budget enregistrée."); router.refresh();
  }}>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-2"><Label htmlFor="budget-infrastructure">Infrastructure</Label><Input defaultValue={display(budget?.infrastructureLimitMicros)} id="budget-infrastructure" inputMode="decimal" name="infrastructureLimitMicros" placeholder="50" /></div>
      <div className="grid gap-2"><Label htmlFor="budget-inference">Inférence</Label><Input defaultValue={display(budget?.inferenceLimitMicros)} id="budget-inference" inputMode="decimal" name="inferenceLimitMicros" placeholder="100" /></div>
      <div className="grid gap-2"><Label htmlFor="budget-global">Global</Label><Input defaultValue={display(budget?.globalLimitMicros)} id="budget-global" inputMode="decimal" name="globalLimitMicros" placeholder="150" /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-2"><Label htmlFor="budget-currency">Devise</Label><Select onValueChange={setCurrency} value={currency}><SelectTrigger id="budget-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EUR">EUR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div>
      <div className="grid gap-2"><Label htmlFor="budget-threshold">Alerte (%)</Label><Input defaultValue={budget?.alertThresholdPercent ?? 80} id="budget-threshold" max={100} min={1} name="threshold" type="number" /></div>
      <div className="grid gap-2"><Label htmlFor="budget-hard-cap">Hard cap</Label><Select onValueChange={setHardCapAction} value={hardCapAction}><SelectTrigger id="budget-hard-cap"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owner_approval">Validation Owner</SelectItem><SelectItem value="pause">Pause</SelectItem><SelectItem value="fallback_model">Modèle de repli</SelectItem></SelectContent></Select></div>
    </div>
    {hardCapAction === "fallback_model" ? <div className="grid gap-2"><Label htmlFor="budget-fallback-model">Modèle de repli forcé</Label><Input defaultValue={budget?.fallbackModel ?? ""} id="budget-fallback-model" maxLength={200} name="fallbackModel" placeholder="provider/model-economique" required /></div> : <input name="fallbackModel" type="hidden" value="" />}
    <Button disabled={pending} type="submit">{pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}Enregistrer les plafonds</Button>
  </form>;
}

export function RotateRelayIdentity({ endpoint }: { endpoint: string }) {
  const [pending, setPending] = useState(false);
  const [command, setCommand] = useState("");
  return <div className="grid gap-3">
    <Button disabled={pending} onClick={async () => {
      setPending(true);
      const response = await fetch(`${endpoint}/enrollment`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string; enrollment?: { token: string; exchangeUrl: string } };
      setPending(false);
      if (!response.ok || !payload.enrollment) { toast.error(payload.error ?? "Rotation impossible."); return; }
      setCommand(`hermes-gateway enroll --url ${JSON.stringify(payload.enrollment.exchangeUrl)} --token ${JSON.stringify(payload.enrollment.token)} --identity-dir /var/lib/hermes-console/identity-next`);
    }} type="button" variant="outline">{pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}Préparer la rotation</Button>
    {command ? <><textarea aria-label="Commande de rotation" className="min-h-24 rounded-lg border bg-muted p-3 font-mono text-xs" readOnly value={command} /><Button onClick={async () => { await navigator.clipboard.writeText(command); toast.success("Commande copiée."); }} type="button" variant="outline"><CopyIcon />Copier</Button><p className="text-xs text-muted-foreground">L’ancienne identité est révoquée seulement après consommation réussie du nouveau jeton.</p></> : null}
  </div>;
}

export function InstallationBackupActions({ endpoint, profiles, backups, features, managed }: {
  endpoint: string;
  profiles: string[];
  backups: Array<{ id: string; status: string }>;
  features: string[];
  managed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [profile, setProfile] = useState(profiles[0] ?? "default");
  const [backupId, setBackupId] = useState(backups.find((backup) => backup.status === "ready")?.id ?? "");
  async function run(action: "create" | "verify" | "restore") {
    if (action === "restore" && !confirmRestore) {
      setConfirmRestore(true);
      return;
    }
    setPending(action);
    const response = await fetch(`${endpoint}/backups`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, profile, backupId: action === "create" ? null : backupId, retentionDays: 30, includeSecrets: false, confirmed: action === "restore" }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(null);
    setConfirmRestore(false);
    if (!response.ok) { toast.error(payload.error ?? "Sauvegarde impossible."); return; }
    toast.success(action === "create" ? "Sauvegarde chiffrée créée et vérifiée." : action === "verify" ? "Intégrité confirmée." : "Restauration terminée avec sauvegarde de sécurité.");
    router.refresh();
  }
  if (!managed) return <p className="text-sm text-muted-foreground">Les sauvegardes restent sous la responsabilité du propriétaire de cette installation externe.</p>;
  return <div className="grid gap-3">
    <div className="grid gap-2"><Label htmlFor="backup-profile">Profil</Label><Select onValueChange={setProfile} value={profile}><SelectTrigger id="backup-profile"><SelectValue /></SelectTrigger><SelectContent>{profiles.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div>
    {backups.length ? <div className="grid gap-2"><Label htmlFor="backup-target">Sauvegarde cible</Label><Select onValueChange={setBackupId} value={backupId}><SelectTrigger id="backup-target"><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{backups.filter((backup) => backup.status === "ready").map((backup) => <SelectItem key={backup.id} value={backup.id}>{backup.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select></div> : null}
    <div className="flex flex-wrap gap-2">
      {features.includes("runtime.backup") ? <Button disabled={Boolean(pending)} onClick={() => run("create")} type="button"><ArchiveIcon />Créer</Button> : null}
      {features.includes("runtime.backup.verify") && backupId ? <Button disabled={Boolean(pending)} onClick={() => run("verify")} type="button" variant="outline"><ShieldCheckIcon />Vérifier</Button> : null}
      {features.includes("runtime.backup.restore") && backupId ? <Button disabled={Boolean(pending)} onClick={() => run("restore")} type="button" variant={confirmRestore ? "destructive" : "outline"}><Undo2Icon />{confirmRestore ? "Confirmer la restauration" : "Restaurer"}</Button> : null}
    </div>
    <p className="text-xs text-muted-foreground">Secrets exclus par défaut. Une restauration crée d’abord une nouvelle sauvegarde chiffrée de sécurité.</p>
  </div>;
}

export function InstallationUpgradeActions({ endpoint, features, profiles, candidates }: {
  endpoint: string;
  features: string[];
  profiles: string[];
  candidates: Array<{ id: string; sourceVersion: string | null; targetVersion: string | null; backupId: string | null }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState("");
  const [profile, setProfile] = useState(profiles[0] ?? "default");
  const [operationId, setOperationId] = useState(candidates[0]?.id ?? "");
  const [confirmedAction, setConfirmedAction] = useState<"upgrade" | "rollback" | null>(null);
  async function run(action: "upgrade" | "rollback") {
    if (confirmedAction !== action) {
      setConfirmedAction(action);
      return;
    }
    setPending(action);
    const response = await fetch(`${endpoint}/upgrades`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, targetVersion, profile, operationId, confirmed: true }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(null); setConfirmedAction(null);
    if (!response.ok) { toast.error(payload.error ?? `${action} impossible.`); router.refresh(); return; }
    toast.success(action === "upgrade" ? "Upgrade validé avec sauvegarde préalable." : "Rollback applicatif et données terminé.");
    router.refresh();
  }
  if (!features.includes("runtime.upgrade") && !features.includes("runtime.rollback")) return null;
  return <div className="grid gap-3 border-t pt-4">
    <h3 className="font-medium">Upgrade et rollback</h3>
    <div className="grid gap-2"><Label htmlFor="upgrade-profile">Profil de validation</Label><Select onValueChange={setProfile} value={profile}><SelectTrigger id="upgrade-profile"><SelectValue /></SelectTrigger><SelectContent>{profiles.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div>
    {features.includes("runtime.upgrade") ? <div className="grid gap-2"><Label htmlFor="upgrade-version">Version allowlistée</Label><Input id="upgrade-version" onChange={(event) => { setTargetVersion(event.target.value); setConfirmedAction(null); }} placeholder="v2026.8.0" value={targetVersion} /><Button disabled={Boolean(pending) || !targetVersion} onClick={() => run("upgrade")} type="button" variant={confirmedAction === "upgrade" ? "destructive" : "outline"}>{confirmedAction === "upgrade" ? "Confirmer backup + upgrade" : "Préparer l’upgrade"}</Button></div> : null}
    {features.includes("runtime.rollback") && candidates.length ? <div className="grid gap-2"><Label htmlFor="rollback-operation">Opération à annuler</Label><Select onValueChange={(value) => { setOperationId(value); setConfirmedAction(null); }} value={operationId}><SelectTrigger id="rollback-operation"><SelectValue /></SelectTrigger><SelectContent>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.targetVersion ?? "upgrade"} → {candidate.sourceVersion ?? "version précédente"}</SelectItem>)}</SelectContent></Select><Button disabled={Boolean(pending) || !operationId} onClick={() => run("rollback")} type="button" variant={confirmedAction === "rollback" ? "destructive" : "outline"}><Undo2Icon />{confirmedAction === "rollback" ? "Confirmer rollback + restauration" : "Rollback avec restauration"}</Button></div> : null}
  </div>;
}

export function InstallationCapacityPolicy({ endpoint, limits }: {
  endpoint: string;
  limits: { headroomPercent?: number; maxActiveSessions?: number } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return <form className="grid gap-3" onSubmit={async (event) => {
    event.preventDefault(); setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${endpoint}/capacity-policy`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headroomPercent: Number(form.get("headroomPercent")), maxActiveSessions: Number(form.get("maxActiveSessions")) }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(false);
    if (!response.ok) { toast.error(payload.error ?? "Politique de capacité invalide."); return; }
    toast.success("Seuils de capacité enregistrés."); router.refresh();
  }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor="capacity-headroom">Headroom minimum (%)</Label><Input defaultValue={limits?.headroomPercent ?? 20} id="capacity-headroom" max={80} min={5} name="headroomPercent" type="number" /></div>
      <div className="grid gap-2"><Label htmlFor="capacity-sessions">Sessions actives maximum</Label><Input defaultValue={limits?.maxActiveSessions ?? 20} id="capacity-sessions" max={100000} min={1} name="maxActiveSessions" type="number" /></div>
    </div>
    <Button disabled={pending} type="submit">{pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}Enregistrer le headroom</Button>
    <p className="text-xs text-muted-foreground">Une nouvelle association est bloquée si un seuil est atteint ; aucun redimensionnement n’est lancé sans confirmation.</p>
  </form>;
}
