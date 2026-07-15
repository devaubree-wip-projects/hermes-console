"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPanelHeader } from "@/components/settings/settings-row";

type AgentOption = {
  id: string;
  name: string;
  slug: string;
  runtimeState: "ready" | "setup_required" | "error";
};

type MessagingEnv = {
  key: string;
  required: boolean;
  is_set: boolean;
  redacted_value: string | null;
  description: string;
  prompt: string;
  is_password: boolean;
};

type MessagingPlatform = {
  id: "telegram" | "discord";
  name: string;
  description: string;
  docs_url: string;
  enabled: boolean;
  configured: boolean;
  gateway_running: boolean;
  state: string | null;
  error_message: string | null;
  env_vars: MessagingEnv[];
};

type MessagingState = {
  agent: { id: string; name: string; slug: string };
  canEdit: boolean;
  gatewayStartCommand: string;
  platforms: MessagingPlatform[];
};

type Draft = {
  token: string;
  allowedUsers: string;
  replyMode: string;
  showToken: boolean;
};

type Feedback = {
  kind: "success" | "warning" | "error";
  title: string;
  message: string;
};

type TelegramOnboardingSetup = {
  pairing_id: string;
  suggested_username: string;
  deep_link: string;
  expires_at: string;
};

type TelegramOnboardingStatus =
  | { status: "waiting"; expires_at: string }
  | {
      status: "ready";
      bot_username?: string | null;
      owner_user_id?: string | null;
      expires_at: string;
    };

type TelegramOnboardingApply = {
  ok: boolean;
  bot_username?: string | null;
  needs_restart?: boolean;
  restart_error?: string | null;
};

const EMPTY_DRAFT: Draft = {
  token: "",
  allowedUsers: "",
  replyMode: "",
  showToken: false,
};

const STATE_LABELS: Record<string, string> = {
  connected: "Connecté",
  disabled: "Désactivé",
  gateway_stopped: "Gateway arrêté",
  not_configured: "À configurer",
  pending_restart: "Connexion…",
  startup_failed: "Erreur",
};

function credentialKey(platform: MessagingPlatform["id"]) {
  return platform === "telegram" ? "TELEGRAM_BOT_TOKEN" : "DISCORD_BOT_TOKEN";
}

function allowedUsersKey(platform: MessagingPlatform["id"]) {
  return platform === "telegram" ? "TELEGRAM_ALLOWED_USERS" : "DISCORD_ALLOWED_USERS";
}

function field(platform: MessagingPlatform, key: string) {
  return platform.env_vars.find((item) => item.key === key);
}

function stateVariant(platform: MessagingPlatform) {
  if (platform.state === "connected") return "success" as const;
  if (["startup_failed", "gateway_stopped"].includes(platform.state ?? "")) {
    return "destructive" as const;
  }
  if (platform.state === "pending_restart") return "warning" as const;
  return "secondary" as const;
}

function platformHelp(platform: MessagingPlatform) {
  if (platform.id === "telegram") {
    return "Sans identifiant autorisé, le premier DM reçoit un code de pairing à approuver côté Hermes.";
  }
  return "Activez Message Content Intent dans le Developer Portal et invitez le bot sur votre serveur.";
}

async function postMessagingAction<T>(apiEndpoint: string, body: Record<string, unknown>) {
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Action Telegram impossible.");
  return payload;
}

export function MessagingIntegrationsPanel({
  agents,
  activeAgent,
  integrationsBase,
  apiEndpoint,
}: {
  agents: AgentOption[];
  activeAgent: AgentOption;
  integrationsBase: string;
  apiEndpoint: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<MessagingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [telegramSetup, setTelegramSetup] = useState<TelegramOnboardingSetup | null>(null);
  const [telegramPhase, setTelegramPhase] = useState<
    "idle" | "starting" | "waiting" | "ready" | "applying" | "complete"
  >("idle");
  const [telegramSetupError, setTelegramSetupError] = useState<string | null>(null);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const [telegramOwnerId, setTelegramOwnerId] = useState<string | null>(null);
  const [telegramManualOpen, setTelegramManualOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<MessagingPlatform["id"], Draft>>({
    telegram: { ...EMPTY_DRAFT },
    discord: { ...EMPTY_DRAFT },
  });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(apiEndpoint, { cache: "no-store" });
      const payload = await response.json() as MessagingState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Configuration Hermes indisponible.");
      setData(payload);
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Impossible de lire les channels",
        message: error instanceof Error ? error.message : "Le runtime Hermes ne répond pas.",
      });
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const applyTelegramOnboarding = useCallback(async (
    setup: TelegramOnboardingSetup,
    allowedUserIds: string[],
    botUsername?: string | null,
  ) => {
    setAction("telegram:onboarding");
    setTelegramPhase("applying");
    setTelegramSetupError(null);
    try {
      const result = await postMessagingAction<TelegramOnboardingApply>(apiEndpoint, {
        action: "telegram_onboarding_apply",
        pairingId: setup.pairing_id,
        allowedUserIds,
      });
      setTelegramBotUsername(result.bot_username || botUsername || null);
      setTelegramOwnerId(allowedUserIds[0] ?? null);
      setTelegramSetup(null);
      setTelegramPhase("complete");
      setTelegramManualOpen(false);
      setFeedback(result.needs_restart
        ? {
            kind: "warning",
            title: "Telegram enregistré",
            message: `Le gateway doit encore être redémarré${result.restart_error ? ` : ${result.restart_error}` : "."}`,
          }
        : {
            kind: "success",
            title: "Telegram est prêt",
            message: "Ton compte est autorisé et le gateway Hermes redémarre avec le nouveau bot.",
          });
      await load(true);
      window.setTimeout(() => void load(true), 4_000);
    } catch (error) {
      setTelegramPhase("ready");
      setTelegramSetupError(
        error instanceof Error ? error.message : "Impossible de finaliser la connexion Telegram.",
      );
    } finally {
      setAction(null);
    }
  }, [apiEndpoint, load]);

  useEffect(() => {
    if (!telegramSetup || telegramPhase !== "waiting") return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const status = await postMessagingAction<TelegramOnboardingStatus>(apiEndpoint, {
          action: "telegram_onboarding_status",
          pairingId: telegramSetup.pairing_id,
        });
        if (cancelled) return;
        if (status.status === "ready") {
          const ownerId = status.owner_user_id?.trim() ?? "";
          setTelegramBotUsername(status.bot_username ?? null);
          if (/^\d+$/.test(ownerId)) {
            setTelegramOwnerId(ownerId);
            await applyTelegramOnboarding(telegramSetup, [ownerId], status.bot_username);
            return;
          }
          setTelegramPhase("ready");
          setTelegramManualOpen(true);
          setTelegramSetupError(
            "Le bot est créé, mais Telegram n’a pas transmis ton identifiant. Saisis-le ci-dessous pour finaliser.",
          );
          return;
        }
        setTelegramSetupError(null);
        timer = window.setTimeout(() => void poll(), 2_000);
      } catch (error) {
        if (cancelled) return;
        const expired = Date.now() >= Date.parse(telegramSetup.expires_at);
        if (expired) {
          setTelegramSetup(null);
          setTelegramPhase("idle");
          setTelegramSetupError("La connexion Telegram a expiré. Relance-la pour réessayer.");
          return;
        }
        setTelegramSetupError(
          error instanceof Error ? `${error.message} Nouvelle tentative en cours.` : "Nouvelle tentative en cours.",
        );
        timer = window.setTimeout(() => void poll(), 2_000);
      }
    };

    timer = window.setTimeout(() => void poll(), 1_200);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [apiEndpoint, applyTelegramOnboarding, telegramPhase, telegramSetup]);

  async function startTelegramOnboarding() {
    const telegramWindow = window.open("about:blank", "_blank");
    if (telegramWindow) telegramWindow.opener = null;
    setAction("telegram:onboarding");
    setTelegramPhase("starting");
    setTelegramSetupError(null);
    setTelegramBotUsername(null);
    setTelegramOwnerId(null);
    setFeedback(null);
    try {
      const setup = await postMessagingAction<TelegramOnboardingSetup>(apiEndpoint, {
        action: "telegram_onboarding_start",
      });
      setTelegramSetup(setup);
      setTelegramPhase("waiting");
      if (telegramWindow) telegramWindow.location.href = setup.deep_link;
    } catch (error) {
      telegramWindow?.close();
      setTelegramPhase("idle");
      setTelegramSetupError(
        error instanceof Error ? error.message : "Impossible de démarrer la connexion Telegram.",
      );
    } finally {
      setAction(null);
    }
  }

  async function cancelTelegramOnboarding() {
    const setup = telegramSetup;
    setAction("telegram:onboarding");
    try {
      if (setup) {
        await postMessagingAction<Record<string, unknown>>(apiEndpoint, {
          action: "telegram_onboarding_cancel",
          pairingId: setup.pairing_id,
        });
      }
    } catch {
      // The local reset is authoritative; expired remote pairings are harmless.
    } finally {
      setTelegramSetup(null);
      setTelegramPhase("idle");
      setTelegramSetupError(null);
      setAction(null);
    }
  }

  async function finishTelegramOnboardingManually() {
    if (!telegramSetup) return;
    const allowedUserIds = drafts.telegram.allowedUsers
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));
    if (allowedUserIds.length === 0) {
      setTelegramSetupError("Saisis au moins un identifiant Telegram numérique.");
      return;
    }
    await applyTelegramOnboarding(telegramSetup, allowedUserIds, telegramBotUsername);
  }

  const gatewayRunning = useMemo(
    () => data?.platforms.some((platform) => platform.gateway_running) ?? false,
    [data],
  );

  function updateDraft(platform: MessagingPlatform["id"], patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [platform]: { ...current[platform], ...patch },
    }));
  }

  async function request(
    body: Record<string, unknown>,
    pendingKey: string,
    success: Feedback,
    method: "PUT" | "POST" = "POST",
  ) {
    setAction(pendingKey);
    setFeedback(null);
    try {
      const response = await fetch(apiEndpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        message?: string;
        restartWarning?: string | null;
      };
      if (!response.ok) throw new Error(payload.error || "Action Hermes impossible.");
      const resultFeedback = payload.restartWarning
        ? {
            kind: "warning" as const,
            title: "Configuration enregistrée",
            message: `Le gateway n’a pas redémarré automatiquement : ${payload.restartWarning}`,
          }
        : payload.message
          ? {
              kind: payload.ok === true ? "success" as const : "warning" as const,
              title: payload.ok === true ? "Channel opérationnel" : "Vérification Hermes",
              message: payload.message,
            }
          : success;
      setFeedback(resultFeedback);
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      await load(true);
      return true;
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Action impossible",
        message: error instanceof Error ? error.message : "Le runtime Hermes ne répond pas.",
      });
      return false;
    } finally {
      setAction(null);
    }
  }

  async function savePlatform(platform: MessagingPlatform) {
    const draft = drafts[platform.id];
    const saved = await request(
      {
        platform: platform.id,
        enabled: true,
        token: draft.token || undefined,
        allowedUsers: draft.allowedUsers || undefined,
        replyMode: platform.id === "discord" ? draft.replyMode || undefined : undefined,
      },
      `save:${platform.id}`,
      {
        kind: "success",
        title: `${platform.name} connecté`,
        message: `Le credential est enregistré dans le profil de ${activeAgent.name} et le gateway redémarre.`,
      },
      "PUT",
    );
    if (saved) updateDraft(platform.id, { token: "", showToken: false });
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Lecture des channels Hermes…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsPanelHeader
        title="Intégrations"
        description="Reliez Telegram et Discord au profil Hermes de chaque agent. Les conversations restent isolées par agent."
      />

      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "destructive" : feedback.kind === "warning" ? "warning" : "success"} title={feedback.title}>
          {feedback.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 rounded-xl border bg-muted/15 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="messaging-agent">Agent connecté</Label>
          <Select
            value={activeAgent.id}
            onValueChange={(agentId) => router.push(`${integrationsBase}?agentId=${encodeURIComponent(agentId)}`)}
          >
            <SelectTrigger id="messaging-agent" className="w-full md:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Profil Hermes : les tokens ci-dessous ne s’appliquent qu’à {activeAgent.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={gatewayRunning ? "success" : "destructive"}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {gatewayRunning ? "Gateway en ligne" : "Gateway arrêté"}
          </Badge>
          {data?.canEdit ? (
            <Button
              type="button"
              variant="outline"
              disabled={action !== null}
              onClick={() => void request(
                { action: gatewayRunning ? "restart" : "start" },
                "gateway",
                {
                  kind: "success",
                  title: gatewayRunning ? "Gateway redémarré" : "Gateway démarré",
                  message: "Hermes applique la configuration des channels de cet agent.",
                },
              )}
            >
              {action === "gateway" ? <Loader2 className="animate-spin" /> : gatewayRunning ? <RefreshCw /> : <Play />}
              {gatewayRunning ? "Redémarrer" : "Démarrer"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {(data?.platforms ?? []).map((platform) => {
          const Icon = platform.id === "telegram" ? Send : MessageCircle;
          const draft = drafts[platform.id];
          const credential = field(platform, credentialKey(platform.id));
          const allowedUsers = field(platform, allowedUsersKey(platform.id));
          const saving = action === `save:${platform.id}`;
          const testing = action === `test:${platform.id}`;
          const disabling = action === `disable:${platform.id}`;
          const telegramOnboardingActive = ["starting", "waiting", "ready", "applying"].includes(
            telegramPhase,
          );
          const telegramConfigured = platform.configured || telegramPhase === "complete";

          return (
            <section key={platform.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div className="flex min-w-0 gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{platform.name}</h2>
                      <Badge variant={stateVariant(platform)}>
                        {platform.state === "connected" ? <CheckCircle2 className="mr-1 size-3" /> : null}
                        {STATE_LABELS[platform.state ?? ""] ?? "Inconnu"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{platform.description}</p>
                  </div>
                </div>
                {platform.docs_url ? (
                  <Button asChild size="icon" variant="ghost">
                    <a href={platform.docs_url} target="_blank" rel="noreferrer" aria-label={`Documentation ${platform.name}`}>
                      <ExternalLink />
                    </a>
                  </Button>
                ) : null}
              </div>

              <div className="space-y-5 p-5">
                {platform.error_message ? (
                  <Alert variant="warning" title="Erreur remontée par Hermes">
                    {platform.error_message}
                  </Alert>
                ) : null}

                {platform.id === "telegram" ? (
                  <div className="space-y-4">
                    {telegramSetupError ? (
                      <Alert variant="warning" title="Connexion Telegram">
                        {telegramSetupError}
                      </Alert>
                    ) : null}

                    {telegramOnboardingActive ? (
                      <div className="space-y-4 rounded-lg bg-muted/45 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground shadow-xs">
                            {telegramPhase === "waiting" ? (
                              <Radio className="size-4 animate-pulse" />
                            ) : (
                              <Loader2 className="size-4 animate-spin" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-medium">Connexion Telegram en cours</h3>
                              <Badge variant="outline">
                                {telegramPhase === "waiting" ? "Action requise" : "Configuration"}
                              </Badge>
                            </div>
                            <p className="mt-1 max-w-[68ch] text-xs leading-5 text-muted-foreground">
                              {telegramPhase === "waiting"
                                ? "Confirme la création du bot dans Telegram. Hermes détectera ensuite ton compte."
                                : telegramPhase === "ready"
                                  ? "Le bot est créé. Ajoute ton identifiant dans la configuration manuelle pour terminer."
                                  : "Hermes prépare le bot et sécurise son accès."}
                            </p>
                          </div>
                        </div>

                        {telegramSetup && telegramPhase === "waiting" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button asChild type="button">
                              <a href={telegramSetup.deep_link} target="_blank" rel="noreferrer">
                                <ExternalLink /> Ouvrir Telegram
                              </a>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={action !== null}
                              onClick={() => void cancelTelegramOnboarding()}
                            >
                              <X /> Annuler
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Expire à {new Date(telegramSetup.expires_at).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ) : null}

                        {telegramSetup && telegramPhase === "ready" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              disabled={action !== null}
                              onClick={() => void finishTelegramOnboardingManually()}
                            >
                              <CheckCircle2 /> Finaliser la connexion
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={action !== null}
                              onClick={() => void cancelTelegramOnboarding()}
                            >
                              <X /> Annuler
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : telegramConfigured ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                            <ShieldCheck className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-medium">
                                {telegramBotUsername ? `@${telegramBotUsername}` : "Bot Telegram configuré"}
                              </h3>
                              <Badge variant="outline"><CheckCircle2 /> Accès protégé</Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {telegramOwnerId
                                ? `Le compte ${telegramOwnerId} est autorisé.`
                                : allowedUsers?.is_set
                                  ? "Une liste d’utilisateurs autorisés protège ce bot."
                                  : "Les nouveaux utilisateurs devront être approuvés par pairing."}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={action !== null}
                            onClick={() => void startTelegramOnboarding()}
                          >
                            <RefreshCw /> Remplacer le bot
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={action !== null}
                            onClick={() => setTelegramManualOpen(true)}
                          >
                            <ShieldCheck /> Gérer les accès
                          </Button>
                          {platform.configured ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={action !== null}
                              onClick={() => void request(
                                { action: "test", platform: platform.id },
                                `test:${platform.id}`,
                                {
                                  kind: "success",
                                  title: "Vérification terminée",
                                  message: "Telegram répond via le gateway Hermes.",
                                },
                              )}
                            >
                              {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                              Tester
                            </Button>
                          ) : null}
                          {platform.enabled ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={action !== null}
                              onClick={() => void request(
                                { platform: platform.id, enabled: false },
                                `disable:${platform.id}`,
                                {
                                  kind: "success",
                                  title: "Telegram désactivé",
                                  message: "Le credential reste conservé pour une reconnexion ultérieure.",
                                },
                                "PUT",
                              )}
                            >
                              {disabling ? <Loader2 className="animate-spin" /> : <CircleAlert />}
                              Désactiver
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                            <Sparkles className="size-4" />
                          </span>
                          <div>
                            <h3 className="text-sm font-medium">Connecter Telegram</h3>
                            <p className="mt-1 max-w-[68ch] text-xs leading-5 text-muted-foreground">
                              Hermes crée le bot, détecte ton compte, sécurise l’accès et redémarre le gateway.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          disabled={action !== null}
                          onClick={() => void startTelegramOnboarding()}
                        >
                          <Send /> Connecter avec Telegram
                        </Button>
                      </div>
                    )}

                    {!telegramOnboardingActive ? (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border-t pt-4 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-expanded={telegramManualOpen}
                        aria-controls="telegram-manual-configuration"
                        onClick={() => setTelegramManualOpen((open) => !open)}
                      >
                        <span>
                          Configuration manuelle
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Token et identifiants numériques
                          </span>
                        </span>
                        <ChevronDown className={`size-4 transition-transform ${telegramManualOpen ? "rotate-180" : ""}`} />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div
                  id={platform.id === "telegram" ? "telegram-manual-configuration" : undefined}
                  className={platform.id === "telegram" && !telegramManualOpen ? "hidden" : "space-y-5"}
                >
                <div className="space-y-2">
                  <Label htmlFor={`${platform.id}-token`}>Token du bot</Label>
                  <div className="relative">
                    <Input
                      id={`${platform.id}-token`}
                      type={draft.showToken ? "text" : "password"}
                      value={draft.token}
                      disabled={!data?.canEdit || saving}
                      autoComplete="new-password"
                      placeholder={credential?.is_set ? "Token configuré — laisser vide pour le conserver" : "Coller le token du bot"}
                      onChange={(event) => updateDraft(platform.id, { token: event.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
                      disabled={!draft.token}
                      aria-label={draft.showToken ? "Masquer le token" : "Afficher le token"}
                      onClick={() => updateDraft(platform.id, { showToken: !draft.showToken })}
                    >
                      {draft.showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {credential?.is_set ? "Credential présent dans le profil Hermes." : "Le token sera stocké uniquement dans le profil Hermes de l’agent."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${platform.id}-allowed-users`}>Utilisateurs autorisés</Label>
                  <Input
                    id={`${platform.id}-allowed-users`}
                    value={draft.allowedUsers}
                    disabled={!data?.canEdit || saving}
                    inputMode="numeric"
                    placeholder={allowedUsers?.is_set ? "Liste configurée — laisser vide pour la conserver" : "IDs numériques séparés par des virgules (optionnel)"}
                    onChange={(event) => updateDraft(platform.id, { allowedUsers: event.target.value })}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">{platformHelp(platform)}</p>
                </div>

                {platform.id === "discord" ? (
                  <div className="space-y-2">
                    <Label>Mode de réponse</Label>
                    <Select
                      value={draft.replyMode || "preserve"}
                      disabled={!data?.canEdit || saving}
                      onValueChange={(value) => updateDraft(platform.id, { replyMode: value === "preserve" ? "" : value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preserve">Conserver la configuration</SelectItem>
                        <SelectItem value="first">Référence sur le premier message</SelectItem>
                        <SelectItem value="all">Référence sur chaque message</SelectItem>
                        <SelectItem value="off">Aucune référence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {!data?.canEdit ? (
                  <Alert variant="info" title="Lecture seule">
                    Seul un Owner peut modifier les credentials et le gateway.
                  </Alert>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      disabled={action !== null || (!credential?.is_set && !draft.token.trim())}
                      onClick={() => void savePlatform(platform)}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      {platform.id === "telegram" ? "Enregistrer la configuration" : "Enregistrer et connecter"}
                    </Button>
                    {platform.id !== "telegram" && platform.enabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={action !== null}
                        onClick={() => void request(
                          { platform: platform.id, enabled: false },
                          `disable:${platform.id}`,
                          {
                            kind: "success",
                            title: `${platform.name} désactivé`,
                            message: "Le credential reste conservé dans le profil pour une reconnexion ultérieure.",
                          },
                          "PUT",
                        )}
                      >
                        {disabling ? <Loader2 className="animate-spin" /> : <CircleAlert />}
                        Désactiver
                      </Button>
                    ) : null}
                    {platform.id !== "telegram" && platform.configured ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={action !== null}
                        onClick={() => void request(
                          { action: "test", platform: platform.id },
                          `test:${platform.id}`,
                          {
                            kind: "success",
                            title: "Vérification terminée",
                            message: `${platform.name} répond via le gateway Hermes.`,
                          },
                        )}
                      >
                        {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        Tester
                      </Button>
                    ) : null}
                  </div>
                )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
