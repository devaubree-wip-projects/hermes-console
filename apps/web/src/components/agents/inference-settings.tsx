"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import { HermesProvider, useHermesState } from "@/lib/hermes/client";
import {
  CODEX_SUBSCRIPTION_PROVIDER,
  type CodexLoginStart,
  type CodexLoginStatus,
} from "@/lib/hermes/codex-subscription";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReasoningControlId } from "@/components/shared/chat/constants/reasoning-config";

type AgentOption = {
  id: string;
  name: string;
  slug: string;
  runtimeState: "ready" | "setup_required" | "error";
};

type ProviderOption = {
  id: string;
  name: string;
  models: string[];
  authenticated: boolean;
  setupMode: "credential" | "oauth" | "external" | "none" | "advanced";
  credentialConfigured: boolean;
  credentialUrl: string | null;
  oauthFlow: "pkce" | "device_code" | "external" | null;
  oauthLoggedIn: boolean;
  docsUrl: string | null;
  capabilities?: Record<string, { fast?: boolean; reasoning?: boolean }>;
};

type InferenceState = {
  agent: { id: string; name: string; slug: string };
  canEdit: boolean;
  currentProvider: string;
  currentModel: string;
  currentReasoningEffort: ReasoningControlId;
  providers: ProviderOption[];
};

type Feedback = {
  kind: "success" | "warning" | "error";
  title: string;
  message: string;
};

type CodexLoginView = CodexLoginStart & CodexLoginStatus & {
  expiresAtMs: number;
};

export function InferenceSettings({
  agents,
  activeAgent,
  modelsBase,
  apiEndpoint,
  ticketEndpoint,
  newSessionHref,
  embedded = false,
}: {
  agents: AgentOption[];
  activeAgent: AgentOption;
  modelsBase: string;
  apiEndpoint: string;
  ticketEndpoint: string;
  newSessionHref: string;
  embedded?: boolean;
}) {
  return (
    <HermesProvider key={activeAgent.id} ticketEndpoint={ticketEndpoint}>
      <InferenceSettingsContent
        agents={agents}
        activeAgent={activeAgent}
        modelsBase={modelsBase}
        apiEndpoint={apiEndpoint}
        newSessionHref={newSessionHref}
        embedded={embedded}
      />
    </HermesProvider>
  );
}

function InferenceSettingsContent({
  agents,
  activeAgent,
  modelsBase,
  apiEndpoint,
  newSessionHref,
  embedded,
}: Omit<Parameters<typeof InferenceSettings>[0], "ticketEndpoint">) {
  const router = useRouter();
  const { conn, agentOnline } = useHermesState();
  const [data, setData] = useState<InferenceState | null>(null);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningControlId>("high");
  const [credential, setCredential] = useState("");
  const [showCredential, setShowCredential] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<
    "credential" | "model" | "remove" | "oauth-start" | "oauth-disconnect" | null
  >(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [costConfirmationRequired, setCostConfirmationRequired] = useState(false);
  const [confirmExpensive, setConfirmExpensive] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [codexLogin, setCodexLogin] = useState<CodexLoginView | null>(null);
  const [codexDialogOpen, setCodexDialogOpen] = useState(false);
  const [codexNow, setCodexNow] = useState(() => Date.now());
  const [codeCopied, setCodeCopied] = useState(false);
  const pendingCodexSessionRef = useRef<string | null>(null);
  const codexEndpoint = `${apiEndpoint}/codex`;

  const selectState = useCallback((payload: InferenceState, preferredProvider?: string) => {
    const nextProvider = payload.providers.find((provider) => provider.id === preferredProvider)
      ?? payload.providers.find((provider) => provider.id === payload.currentProvider)
      ?? payload.providers.find((provider) => provider.authenticated)
      ?? payload.providers[0];
    setData(payload);
    setReasoningEffort(payload.currentReasoningEffort || "high");
    setProviderId(nextProvider?.id ?? "");
    setModel(
      nextProvider?.id === payload.currentProvider
        && nextProvider.models.includes(payload.currentModel)
        ? payload.currentModel
        : nextProvider?.models[0] ?? "",
    );
  }, []);

  const load = useCallback(async (preferredProvider?: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(apiEndpoint, { cache: "no-store" });
      const payload = await response.json() as InferenceState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Configuration Hermes indisponible.");
      selectState(payload, preferredProvider);
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Impossible de lire la configuration",
        message: error instanceof Error ? error.message : "Le runtime Hermes ne répond pas.",
      });
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, selectState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [agentOnline, load]);

  useEffect(() => {
    pendingCodexSessionRef.current = codexLogin?.status === "pending"
      ? codexLogin.sessionId
      : null;
  }, [codexLogin]);

  useEffect(() => () => {
    const sessionId = pendingCodexSessionRef.current;
    if (sessionId) {
      void fetch(`${codexEndpoint}?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        keepalive: true,
      });
    }
  }, [codexEndpoint]);

  useEffect(() => {
    if (!codexDialogOpen || codexLogin?.status !== "pending") return;
    const timer = window.setInterval(() => setCodexNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [codexDialogOpen, codexLogin?.status]);

  useEffect(() => {
    if (!codexDialogOpen || codexLogin?.status !== "pending") return;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(
          `${codexEndpoint}?sessionId=${encodeURIComponent(codexLogin.sessionId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json() as CodexLoginStatus & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Statut Codex indisponible.");
        if (disposed) return;
        if (payload.status === "pending") {
          timer = window.setTimeout(() => void poll(), codexLogin.pollInterval * 1_000);
          return;
        }
        setCodexLogin((current) => current ? { ...current, ...payload } : current);
        if (payload.status === "approved") {
          await load(CODEX_SUBSCRIPTION_PROVIDER);
          if (!disposed) {
            setFeedback({
              kind: "success",
              title: "Abonnement Codex connecté",
              message: "Choisissez maintenant le modèle Codex à utiliser pour les nouvelles sessions.",
            });
          }
        }
      } catch (error) {
        if (disposed) return;
        setCodexLogin((current) => current ? {
          ...current,
          status: "error",
          error: error instanceof Error ? error.message : "Impossible de vérifier la connexion.",
        } : current);
      }
    };
    timer = window.setTimeout(() => void poll(), codexLogin.pollInterval * 1_000);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    codexDialogOpen,
    codexEndpoint,
    codexLogin?.pollInterval,
    codexLogin?.sessionId,
    codexLogin?.status,
    load,
  ]);

  const selectedProvider = data?.providers.find((provider) => provider.id === providerId) ?? null;
  const canEdit = data?.canEdit === true;
  const busy = action !== null;

  function changeProvider(nextProviderId: string) {
    const nextProvider = data?.providers.find((provider) => provider.id === nextProviderId);
    setProviderId(nextProviderId);
    setModel(
      nextProviderId === data?.currentProvider && nextProvider?.models.includes(data.currentModel)
        ? data.currentModel
        : nextProvider?.models[0] ?? "",
    );
    setCredential("");
    setConfirmRemoval(false);
    setCostConfirmationRequired(false);
    setConfirmExpensive(false);
    setModelSaved(false);
    setFeedback(null);
  }

  async function connectCredential() {
    if (!selectedProvider || !credential || busy) return;
    setAction("credential");
    setFeedback(null);
    setModelSaved(false);
    try {
      const response = await fetch(apiEndpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "credential", provider: selectedProvider.id, credential }),
      });
      const payload = await response.json() as {
        error?: string;
        warning?: string | null;
        state?: InferenceState;
      };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error || "La connexion au fournisseur a échoué.");
      }
      selectState(payload.state, selectedProvider.id);
      setCredential("");
      setFeedback({
        kind: payload.warning ? "warning" : "success",
        title: payload.warning ? "Identifiant enregistré" : "Fournisseur connecté",
        message: payload.warning || `${selectedProvider.name} est prêt. Vous pouvez maintenant choisir un modèle.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Connexion impossible",
        message: error instanceof Error ? error.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      setAction(null);
    }
  }

  async function startCodexLogin() {
    if (!canEdit || busy) return;
    setAction("oauth-start");
    setFeedback(null);
    setCodeCopied(false);
    try {
      const response = await fetch(codexEndpoint, { method: "POST" });
      const payload = await response.json() as CodexLoginStart & { error?: string };
      if (!response.ok || !payload.sessionId || !payload.userCode) {
        throw new Error(payload.error || "La connexion Codex n’a pas pu démarrer.");
      }
      const now = Date.now();
      setCodexNow(now);
      setCodexLogin({
        ...payload,
        status: "pending",
        expiresAtMs: now + payload.expiresIn * 1_000,
      });
      setCodexDialogOpen(true);
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Connexion Codex impossible",
        message: error instanceof Error ? error.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      setAction(null);
    }
  }

  async function cancelCodexLogin() {
    const sessionId = codexLogin?.status === "pending" ? codexLogin.sessionId : null;
    setCodexDialogOpen(false);
    setCodexLogin(null);
    setCodeCopied(false);
    if (!sessionId) return;
    try {
      await fetch(`${codexEndpoint}?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      // The Hermes session expires by itself; closing the dialog must stay instant.
    }
  }

  async function copyCodexCode() {
    if (!codexLogin?.userCode) return;
    try {
      await navigator.clipboard.writeText(codexLogin.userCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2_000);
    } catch {
      setCodeCopied(false);
    }
  }

  async function disconnectCodex() {
    if (!canEdit || busy) return;
    setAction("oauth-disconnect");
    setFeedback(null);
    setModelSaved(false);
    try {
      const response = await fetch(codexEndpoint, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "L’abonnement Codex n’a pas pu être déconnecté.");
      await load(CODEX_SUBSCRIPTION_PROVIDER);
      setConfirmRemoval(false);
      setFeedback({
        kind: "success",
        title: "Abonnement Codex déconnecté",
        message: "Les jetons de ce compte ont été retirés du profil Hermes de l’agent.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Déconnexion impossible",
        message: error instanceof Error ? error.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      setAction(null);
    }
  }

  async function saveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider || !model || busy) return;
    setAction("model");
    setFeedback(null);
    setModelSaved(false);
    try {
      const response = await fetch(apiEndpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "model",
          provider: selectedProvider.id,
          model,
          reasoningEffort,
          confirmExpensiveModel: confirmExpensive,
        }),
      });
      const payload = await response.json() as {
        error?: string;
        confirmRequired?: boolean;
      };
      if (response.status === 409 && payload.confirmRequired) {
        setCostConfirmationRequired(true);
        setConfirmExpensive(false);
        setFeedback({
          kind: "warning",
          title: "Confirmation de coût requise",
          message: payload.error || "Confirmez l’utilisation de ce modèle puis enregistrez à nouveau.",
        });
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Le modèle n’a pas été enregistré.");
      setCostConfirmationRequired(false);
      setConfirmExpensive(false);
      setModelSaved(true);
      setData((current) => current ? {
        ...current,
        currentProvider: selectedProvider.id,
        currentModel: model,
        currentReasoningEffort: reasoningEffort,
      } : current);
      setFeedback({
        kind: "success",
        title: "Modèle enregistré",
        message: `${selectedProvider.name} sera utilisé par les prochaines sessions de cet agent.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Échec de l’enregistrement",
        message: error instanceof Error ? error.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      setAction(null);
    }
  }

  async function removeCredential() {
    if (!selectedProvider || busy) return;
    setAction("remove");
    setFeedback(null);
    setModelSaved(false);
    try {
      const response = await fetch(apiEndpoint, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider.id }),
      });
      const payload = await response.json() as { error?: string; state?: InferenceState };
      if (!response.ok) throw new Error(payload.error || "L’identifiant n’a pas pu être retiré.");
      if (payload.state) selectState(payload.state, selectedProvider.id);
      setCredential("");
      setConfirmRemoval(false);
      setFeedback({
        kind: "success",
        title: "Identifiant retiré",
        message: `La connexion directe à ${selectedProvider.name} a été supprimée pour cet agent.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Suppression impossible",
        message: error instanceof Error ? error.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      setAction(null);
    }
  }

  function removeSelectedConnection() {
    if (selectedProvider?.id === CODEX_SUBSCRIPTION_PROVIDER) {
      void disconnectCodex();
      return;
    }
    void removeCredential();
  }

  const runtimeLabel = agentOnline
    ? "Runtime connecté"
    : conn === "connecting"
      ? "Démarrage du runtime…"
      : "Runtime hors ligne";
  const currentProviderName = data?.providers.find(
    (provider) => provider.id === data.currentProvider,
  )?.name;
  const selectedProviderReady = selectedProvider?.authenticated === true
    || selectedProvider?.oauthLoggedIn === true;
  const codexSecondsRemaining = codexLogin
    ? Math.max(0, Math.ceil((codexLogin.expiresAtMs - codexNow) / 1_000))
    : 0;
  const codexCountdown = `${Math.floor(codexSecondsRemaining / 60)}:${String(codexSecondsRemaining % 60).padStart(2, "0")}`;
  const removableConnection = selectedProvider?.credentialConfigured === true
    || (selectedProvider?.id === CODEX_SUBSCRIPTION_PROVIDER && selectedProvider.oauthLoggedIn);

  return (
    <>
      <main className={embedded ? "w-full" : "mx-auto max-w-5xl px-5 py-6 md:px-8 md:py-8"}>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Label htmlFor="agent-model-settings">Agent</Label>
          <Select
            value={activeAgent.id}
            onValueChange={(agentId) => router.push(`${modelsBase}?agentId=${encodeURIComponent(agentId)}`)}
          >
            <SelectTrigger id="agent-model-settings" className="h-9 min-w-64 bg-background">
              <Bot />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`size-2 rounded-full ${agentOnline ? "bg-emerald-500" : conn === "connecting" ? "animate-pulse bg-amber-500" : "bg-muted-foreground/40"}`} />
          {runtimeLabel}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="inference-title">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <Cpu className="size-5" />
              <h2 id="inference-title" className="text-lg font-semibold">Inférence</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Paramètres utilisés par les nouvelles sessions de {activeAgent.name}.
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              {agentOnline ? "Lecture de la configuration…" : "Démarrage de Hermes…"}
            </div>
          ) : data && selectedProvider ? (
            <form className="space-y-6" onSubmit={saveModel}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="provider">Fournisseur</Label>
                  <Badge variant={selectedProviderReady ? "outline" : "secondary"}>
                    {selectedProviderReady ? <CheckCircle2 /> : <CircleAlert />}
                    {selectedProviderReady ? "Prêt" : "À connecter"}
                  </Badge>
                </div>
                <Select value={providerId} onValueChange={changeProvider} disabled={busy}>
                  <SelectTrigger id="provider" className="h-9 w-full">
                    <SelectValue placeholder="Choisir un fournisseur" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="max-h-80">
                    {data.providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {data.providers.length} fournisseurs détectés par Hermes.
                </p>
              </div>

              {selectedProvider.setupMode === "credential" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="provider-credential">Identifiant {selectedProvider.name}</Label>
                    {selectedProvider.credentialConfigured ? <Badge variant="outline"><CheckCircle2 />Enregistré</Badge> : null}
                  </div>
                  <div className="relative">
                    <Input
                      id="provider-credential"
                      type={showCredential ? "text" : "password"}
                      value={credential}
                      onChange={(event) => setCredential(event.target.value)}
                      placeholder={selectedProvider.authenticated ? "Laisser vide pour conserver la connexion" : "Coller l’identifiant fournisseur"}
                      autoComplete="new-password"
                      disabled={!canEdit || busy}
                      className="pr-10 font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-0.5"
                      onClick={() => setShowCredential((visible) => !visible)}
                      aria-label={showCredential ? "Masquer l’identifiant" : "Afficher l’identifiant"}
                      disabled={!canEdit}
                    >
                      {showCredential ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => void connectCredential()} disabled={!canEdit || !credential || busy}>
                      {action === "credential" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                      Tester et connecter
                    </Button>
                    {selectedProvider.credentialUrl ? (
                      <Button asChild type="button" variant="link" size="sm">
                        <a href={selectedProvider.credentialUrl} target="_blank" rel="noreferrer">Obtenir un identifiant <ExternalLink /></a>
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">L’identifiant reste privé et n’est jamais réaffiché.</p>
                </div>
              ) : selectedProvider.setupMode === "oauth" ? (
                selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER ? (
                  <div className="rounded-xl bg-muted/45 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {selectedProviderReady ? <CheckCircle2 className="size-4 text-emerald-600" /> : <LogIn className="size-4" />}
                          {selectedProviderReady ? "Abonnement ChatGPT connecté" : "Utiliser votre abonnement Codex"}
                        </div>
                        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                          {selectedProviderReady
                            ? "Hermes conserve et renouvelle les jetons de ce compte uniquement pour cet agent."
                            : "Connectez-vous avec ChatGPT pour utiliser les modèles Codex inclus dans votre abonnement. Aucune OPENAI_API_KEY n’est requise."}
                        </p>
                      </div>
                      {!selectedProviderReady ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void startCodexLogin()}
                          disabled={!canEdit || busy}
                          className="shrink-0"
                        >
                          {action === "oauth-start" ? <Loader2 className="animate-spin" /> : <LogIn />}
                          Se connecter avec ChatGPT
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <Alert variant={selectedProviderReady ? "success" : "info"} title={selectedProviderReady ? "Compte connecté" : "Connexion de compte requise"}>
                    {selectedProviderReady
                      ? `${selectedProvider.name} est prêt.`
                      : `Connectez votre compte ${selectedProvider.name} pour charger ses modèles.`}
                    {selectedProvider.docsUrl ? <a className="ml-1 font-medium underline underline-offset-2" href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">En savoir plus</a> : null}
                  </Alert>
                )
              ) : selectedProvider.setupMode === "external" ? (
                <Alert variant={selectedProvider.authenticated ? "success" : "info"} title={selectedProvider.authenticated ? "Connexion détectée" : "Connexion locale requise"}>
                  {selectedProvider.authenticated
                    ? `${selectedProvider.name} est disponible sur cette machine.`
                    : `Connectez d’abord ${selectedProvider.name} sur cette machine, puis actualisez cette page.`}
                </Alert>
              ) : selectedProvider.setupMode === "advanced" ? (
                <Alert variant="info" title="Configuration locale requise">
                  Ce fournisseur nécessite des paramètres locaux supplémentaires avant de proposer ses modèles.
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="provider-model">Modèle</Label>
                <Select
                  value={model}
                  onValueChange={(value) => {
                    setModel(value);
                    setCostConfirmationRequired(false);
                    setConfirmExpensive(false);
                    setModelSaved(false);
                  }}
                  disabled={!canEdit || busy || selectedProvider.models.length === 0}
                >
                  <SelectTrigger id="provider-model" className="h-9 w-full">
                    <SelectValue placeholder={selectedProvider.models.length ? "Choisir un modèle" : "Aucun modèle chargé"} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="max-h-80">
                    {selectedProvider.models.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedProvider.models.length
                    ? `${selectedProvider.models.length} modèles disponibles. Le changement s’applique aux nouvelles sessions.`
                    : "Connectez le fournisseur puis actualisez pour charger ses modèles."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reasoning-effort">Effort de raisonnement</Label>
                <Select
                  value={reasoningEffort}
                  onValueChange={(value) => {
                    setReasoningEffort(value as ReasoningControlId);
                    setModelSaved(false);
                  }}
                  disabled={!canEdit || busy}
                >
                  <SelectTrigger id="reasoning-effort" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="xhigh">Extra high</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ce niveau est partagé avec le composer et s’applique aux nouvelles sessions.
                </p>
              </div>

              {costConfirmationRequired ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <input
                    type="checkbox"
                    checked={confirmExpensive}
                    onChange={(event) => setConfirmExpensive(event.target.checked)}
                    className="mt-0.5"
                  />
                  Je confirme l’utilisation de ce modèle malgré son coût potentiellement plus élevé.
                </label>
              ) : null}

              {feedback ? <Alert variant={feedback.kind} title={feedback.title}>{feedback.message}</Alert> : null}

              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button type="submit" disabled={busy || !model || selectedProvider.models.length === 0 || (costConfirmationRequired && !confirmExpensive)}>
                    {action === "model" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                    Enregistrer le modèle
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void load()} disabled={busy}>
                    <RefreshCw />Actualiser
                  </Button>
                  {modelSaved ? (
                    <Button asChild variant="outline">
                      <Link href={newSessionHref}>Nouvelle session <ArrowRight /></Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Alert variant="info" title="Accès en lecture seule">
                  Seul un Owner du workspace peut modifier la connexion et le modèle.
                </Alert>
              )}
            </form>
          ) : (
            <div className="space-y-3">
              {feedback ? <Alert variant={feedback.kind} title={feedback.title}>{feedback.message}</Alert> : null}
              <Button variant="outline" onClick={() => void load()} disabled={!agentOnline}>
                <RefreshCw />Réessayer
              </Button>
            </div>
          )}
        </section>

        <aside className="space-y-6 pt-2 lg:border-l lg:border-border/70 lg:pl-6 lg:pt-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Configuration active</p>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Agent</dt>
                <dd className="mt-1 font-medium">{activeAgent.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fournisseur</dt>
                <dd className="mt-1 text-sm font-medium">{currentProviderName || data?.currentProvider || "Non configuré"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Modèle</dt>
                <dd className="mt-1 break-words font-mono text-xs">{data?.currentModel || "Non configuré"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl bg-muted/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4" />Connexion privée</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Chaque agent conserve séparément ses accès aux fournisseurs.
            </p>
          </div>

          {canEdit && removableConnection ? (
            <div className="pt-1">
              {confirmRemoval ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER
                      ? "Déconnecter l’abonnement Codex ?"
                      : `Retirer l’identifiant ${selectedProvider.name} ?`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER
                      ? "Les jetons ChatGPT seront retirés uniquement du profil Hermes de cet agent."
                      : "Ce fournisseur pourra devenir indisponible pour cet agent."}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={removeSelectedConnection} disabled={busy}>
                      {action === "remove" || action === "oauth-disconnect"
                        ? <Loader2 className="animate-spin" />
                        : selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER ? <Unplug /> : <Trash2 />}
                      {selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER ? "Déconnecter" : "Retirer"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemoval(false)} disabled={busy}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="px-0 text-destructive hover:bg-transparent hover:text-destructive" onClick={() => setConfirmRemoval(true)}>
                  {selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER ? <Unplug /> : <Trash2 />}
                  {selectedProvider.id === CODEX_SUBSCRIPTION_PROVIDER ? "Déconnecter Codex" : "Retirer l’identifiant"}
                </Button>
              )}
            </div>
          ) : null}
        </aside>
      </div>
      </main>

      <Dialog
        open={codexDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            void cancelCodexLogin();
            return;
          }
          setCodexDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={codexLogin?.status !== "pending"}>
          <DialogHeader>
            <DialogTitle>
              {codexLogin?.status === "approved"
                ? "Abonnement Codex connecté"
                : codexLogin?.status === "expired"
                  ? "Code expiré"
                  : codexLogin?.status === "error"
                    ? "Connexion interrompue"
                    : "Connecter votre abonnement Codex"}
            </DialogTitle>
            <DialogDescription>
              {codexLogin?.status === "pending"
                ? "Ouvrez OpenAI, connectez-vous au compte ChatGPT à utiliser puis saisissez ce code."
                : codexLogin?.status === "approved"
                  ? "Hermes a enregistré la connexion dans le profil de cet agent."
                  : codexLogin?.status === "expired"
                    ? "Ce code n’est plus valable. Fermez cette fenêtre et recommencez."
                    : codexLogin?.error || "Hermes n’a pas pu terminer la connexion."}
            </DialogDescription>
          </DialogHeader>

          {codexLogin?.status === "pending" ? (
            <div className="space-y-4">
              <button
                type="button"
                className="group flex w-full items-center justify-between rounded-xl bg-muted px-4 py-4 text-left"
                onClick={() => void copyCodexCode()}
              >
                <span className="font-mono text-2xl font-semibold tracking-[0.18em]">{codexLogin.userCode}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                  {codeCopied ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  {codeCopied ? "Copié" : "Copier"}
                </span>
              </button>
              <Button asChild className="w-full">
                <a href={codexLogin.verificationUrl} target="_blank" rel="noreferrer">
                  Ouvrir OpenAI <ExternalLink />
                </a>
              </Button>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />En attente de validation</span>
                <span className="font-mono tabular-nums">{codexCountdown}</span>
              </div>
            </div>
          ) : codexLogin?.status === "approved" ? (
            <Alert variant="success" title="Connexion privée enregistrée">
              Vous pouvez maintenant fermer cette fenêtre et choisir un modèle Codex.
            </Alert>
          ) : null}

          <DialogFooter>
            {codexLogin?.status === "pending" ? (
              <Button type="button" variant="ghost" onClick={() => void cancelCodexLogin()}>
                Annuler
              </Button>
            ) : (
              <Button type="button" onClick={() => void cancelCodexLogin()}>
                Fermer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
