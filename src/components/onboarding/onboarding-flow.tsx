"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  FileText,
  Loader2,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoIcon } from "@/components/v1-xulux/logo";
import { AGENT_TEMPLATES, getAgentTemplate, type AgentTemplateId } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type RuntimeStatus = {
  online: boolean;
  version?: string | null;
  profileCount?: number;
  error?: string;
};

const STEP_LABELS = ["Votre espace", "Votre agent", "Connexion"];

export function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceTouched, setWorkspaceTouched] = useState(false);
  const [agentTemplate, setAgentTemplate] = useState<AgentTemplateId>("general");
  const [agentName, setAgentName] = useState<string>(AGENT_TEMPLATES[0].defaultName);
  const [agentDescription, setAgentDescription] = useState<string>(AGENT_TEMPLATES[0].mission);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 3 || runtime) return;
    let active = true;
    fetch("/api/onboarding/runtime", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: RuntimeStatus) => {
        if (active) setRuntime(data);
      })
      .catch(() => {
        if (active) setRuntime({ online: false, error: "Impossible de vérifier Hermes." });
      })
    return () => {
      active = false;
    };
  }, [runtime, step]);

  function changeOrganization(value: string) {
    setOrganizationName(value);
    if (!workspaceTouched) setWorkspaceName(value);
  }

  function selectTemplate(id: AgentTemplateId) {
    const previous = getAgentTemplate(agentTemplate);
    const next = getAgentTemplate(id);
    if (!next) return;
    setAgentTemplate(id);
    if (!agentName || agentName === previous?.defaultName) setAgentName(next.defaultName);
    if (!agentDescription || agentDescription === previous?.mission) setAgentDescription(next.mission);
  }

  function goTo(nextStep: number) {
    setError(null);
    if (step === 1 && (!organizationName.trim() || !workspaceName.trim())) {
      setError("Renseignez le nom de votre organisation et de votre espace.");
      return;
    }
    if (step === 2 && !agentName.trim()) {
      setError("Donnez un nom à votre agent.");
      return;
    }
    setStep(nextStep);
  }

  async function completeOnboarding() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          workspaceName,
          agentTemplate,
          agentName,
          agentDescription,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.redirectTo) {
          router.replace(data.redirectTo);
          router.refresh();
          return;
        }
        setError(data.error ?? "Impossible de créer votre espace.");
        return;
      }
      router.replace(data.redirectTo);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b px-5 md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
            <LogoIcon className="h-4 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Hermes Console</span>
        </div>
        {step > 0 ? (
          <p className="text-xs text-muted-foreground">Configuration initiale</p>
        ) : null}
      </header>

      {step === 0 ? (
        <WelcomeStep userName={userName} onContinue={() => setStep(1)} />
      ) : (
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl lg:grid-cols-[220px_1fr]">
          <aside className="border-b px-5 py-6 lg:border-r lg:border-b-0 lg:px-6 lg:py-12">
            <ol className="flex gap-2 lg:flex-col lg:gap-1">
              {STEP_LABELS.map((label, index) => {
                const number = index + 1;
                const complete = step > number;
                const current = step === number;
                return (
                  <li key={label} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 lg:px-2">
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      current && "border-foreground bg-foreground text-background",
                      complete && "border-foreground bg-foreground text-background",
                      !current && !complete && "text-muted-foreground",
                    )}>
                      {complete ? <Check className="size-3.5" /> : number}
                    </span>
                    <span className={cn("hidden text-sm lg:block", current ? "font-medium" : "text-muted-foreground")}>{label}</span>
                  </li>
                );
              })}
            </ol>
          </aside>

          <section className="flex items-start justify-center px-5 py-10 md:px-10 lg:py-16">
            <div className="w-full max-w-2xl">
              {step === 1 ? (
                <WorkspaceStep
                  organizationName={organizationName}
                  workspaceName={workspaceName}
                  onOrganizationChange={changeOrganization}
                  onWorkspaceChange={(value) => {
                    setWorkspaceTouched(true);
                    setWorkspaceName(value);
                  }}
                />
              ) : null}
              {step === 2 ? (
                <AgentStep
                  selected={agentTemplate}
                  name={agentName}
                  description={agentDescription}
                  onSelect={selectTemplate}
                  onNameChange={setAgentName}
                  onDescriptionChange={setAgentDescription}
                />
              ) : null}
              {step === 3 ? (
                <RuntimeStep
                  runtime={runtime}
                  pending={!runtime}
                  organizationName={organizationName}
                  workspaceName={workspaceName}
                  agentName={agentName}
                  onRetry={() => setRuntime(null)}
                />
              ) : null}

              {error ? (
                <Alert variant="destructive" className="mt-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="mt-8 flex items-center justify-between border-t pt-6">
                <Button variant="ghost" size="lg" onClick={() => goTo(step - 1)} disabled={pending}>
                  <ArrowLeft /> Retour
                </Button>
                {step < 3 ? (
                  <Button size="lg" onClick={() => goTo(step + 1)}>
                    Continuer <ArrowRight />
                  </Button>
                ) : (
                  <Button size="lg" onClick={completeOnboarding} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Créer mon espace
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function WelcomeStep({ userName, onContinue }: { userName: string; onContinue: () => void }) {
  const firstName = userName.trim().split(/\s+/)[0];
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-12 px-5 py-12 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
      <section className="max-w-xl">
        <p className="mb-5 text-sm font-medium text-muted-foreground">Bienvenue{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] md:text-5xl">
          Votre équipe, augmentée par un agent qui travaille vraiment.
        </h1>
        <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground md:text-lg">
          Configurez son espace, sa mission et ses permissions. Vous pourrez ensuite discuter,
          lancer des tâches et valider chaque action sensible.
        </p>
        <Button size="lg" className="mt-8 h-11 px-4" onClick={onContinue}>
          Configurer mon espace <ArrowRight />
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">Environ 2 minutes · aucune donnée de démonstration</p>
      </section>

      <section className="relative overflow-hidden rounded-2xl border bg-muted/20 p-4 shadow-sm md:p-6" aria-label="Aperçu du fonctionnement d'un agent">
        <div className="rounded-xl border bg-background shadow-sm">
          <div className="flex h-12 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2"><Bot className="size-4" /><span className="text-sm font-medium">Votre premier agent</span></div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-[var(--ok)]" /> Disponible</span>
          </div>
          <div className="space-y-6 p-5 md:p-7">
            <div className="ml-auto max-w-[85%] rounded-xl bg-foreground px-4 py-3 text-sm text-background">
              Analyse les documents importés et prépare-moi les trois prochaines actions.
            </div>
            <div className="space-y-3">
              <p className="text-sm leading-6">Je rassemble le contexte avant de préparer une proposition.</p>
              <div className="space-y-0 overflow-hidden rounded-lg border">
                <PreviewRow icon={FileText} label="3 documents consultés" state="Terminé" />
                <PreviewRow icon={ShieldCheck} label="Aucune action sensible" state="Vérifié" />
                <PreviewRow icon={Sparkles} label="Plan d'action en préparation" state="En cours" active />
              </div>
            </div>
            <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">Écrivez votre première demande…</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewRow({ icon: Icon, label, state, active = false }: { icon: typeof FileText; label: string; state: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-xs"><Icon className="size-3.5 text-muted-foreground" /><span className="truncate">{label}</span></span>
      <span className={cn("text-[11px]", active ? "text-foreground" : "text-muted-foreground")}>{state}</span>
    </div>
  );
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em]">{title}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div>;
}

function WorkspaceStep({ organizationName, workspaceName, onOrganizationChange, onWorkspaceChange }: { organizationName: string; workspaceName: string; onOrganizationChange: (value: string) => void; onWorkspaceChange: (value: string) => void }) {
  return <div><StepHeading eyebrow="Étape 1 sur 3" title="Où travaillera votre agent ?" description="Ces noms structurent votre console. Ils pourront être modifiés plus tard dans les réglages." /><div className="space-y-5"><div className="space-y-2"><Label htmlFor="organizationName">Organisation</Label><Input id="organizationName" autoFocus maxLength={100} placeholder="Acme" value={organizationName} onChange={(event) => onOrganizationChange(event.target.value)} /><p className="text-xs text-muted-foreground">Votre entreprise, association ou équipe.</p></div><div className="space-y-2"><Label htmlFor="workspaceName">Nom de l’espace</Label><Input id="workspaceName" maxLength={100} placeholder="Équipe principale" value={workspaceName} onChange={(event) => onWorkspaceChange(event.target.value)} /><p className="text-xs text-muted-foreground">L’espace regroupe agents, conversations, fichiers et tâches.</p></div></div></div>;
}

function AgentStep({ selected, name, description, onSelect, onNameChange, onDescriptionChange }: { selected: AgentTemplateId; name: string; description: string; onSelect: (id: AgentTemplateId) => void; onNameChange: (value: string) => void; onDescriptionChange: (value: string) => void }) {
  return <div><StepHeading eyebrow="Étape 2 sur 3" title="Quel sera son premier rôle ?" description="Choisissez un point de départ, puis décrivez sa mission avec vos propres mots." /><div className="space-y-2" role="radiogroup" aria-label="Rôle de l'agent">{AGENT_TEMPLATES.map((template) => <button key={template.id} type="button" role="radio" aria-checked={selected === template.id} onClick={() => onSelect(template.id)} className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:border-foreground/30", selected === template.id && "border-foreground bg-muted/40")}><span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", selected === template.id && "border-foreground")}><span className={cn("size-2.5 rounded-full", selected === template.id && "bg-foreground")} /></span><span><span className="block text-sm font-medium">{template.label}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{template.description}</span></span></button>)}</div><div className="mt-6 grid gap-5"><div className="space-y-2"><Label htmlFor="agentName">Nom de l’agent</Label><Input id="agentName" maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="agentDescription">Mission</Label><Textarea id="agentDescription" maxLength={500} rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} /></div></div></div>;
}

function RuntimeStep({ runtime, pending, organizationName, workspaceName, agentName, onRetry }: { runtime: RuntimeStatus | null; pending: boolean; organizationName: string; workspaceName: string; agentName: string; onRetry: () => void }) {
  return <div><StepHeading eyebrow="Étape 3 sur 3" title="Tout est prêt à être créé" description="La console vérifie le moteur Hermes local. Cette vérification ne bloque pas la création de votre espace." /><div className="overflow-hidden rounded-xl border"><div className="grid grid-cols-[120px_1fr] gap-4 border-b px-4 py-3 text-sm"><span className="text-muted-foreground">Organisation</span><span className="font-medium">{organizationName}</span></div><div className="grid grid-cols-[120px_1fr] gap-4 border-b px-4 py-3 text-sm"><span className="text-muted-foreground">Espace</span><span className="font-medium">{workspaceName}</span></div><div className="grid grid-cols-[120px_1fr] gap-4 px-4 py-3 text-sm"><span className="text-muted-foreground">Agent</span><span className="font-medium">{agentName}</span></div></div><div className={cn("mt-5 flex items-start gap-3 rounded-xl border px-4 py-4", runtime?.online ? "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/5" : "bg-muted/20")}>
    {pending ? <Loader2 className="mt-0.5 size-5 animate-spin text-muted-foreground" /> : runtime?.online ? <Radio className="mt-0.5 size-5 text-[var(--ok)]" /> : <CircleAlert className="mt-0.5 size-5 text-[var(--warn)]" />}
    <div className="min-w-0 flex-1">{pending ? <><p className="text-sm font-medium">Détection de Hermes…</p><p className="mt-1 text-xs text-muted-foreground">Vérification du runtime local.</p></> : runtime?.online ? <><p className="text-sm font-medium">Hermes est prêt{runtime.version ? ` · v${runtime.version}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Le profil de votre agent sera créé automatiquement.</p></> : <><p className="text-sm font-medium">Hermes n’est pas joignable pour le moment</p><p className="mt-1 text-xs leading-5 text-muted-foreground">L’espace sera quand même créé. Le broker tentera de reconnecter le runtime.</p><button type="button" className="mt-2 text-xs font-medium underline underline-offset-4" onClick={onRetry}>Vérifier à nouveau</button></>}</div>
  </div></div>;
}
