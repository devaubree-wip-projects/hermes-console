import { canConfigureAgentRuntime, type AgentContextParams, type AgentRuntimeContext } from "../domain/agent-context";
import { result, type ApplicationResult } from "./application-result";
import {
  isSupportedPlatform,
  type MessagingDependencies,
  type SupportedPlatform,
} from "./messaging-ports";

function normalizedPairingId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[a-zA-Z0-9_-]{1,200}$/.test(normalized) ? normalized : null;
}

function activeBotName(agentName: string) {
  return `${agentName.trim() || "Assistant"} via Hermes`.slice(0, 64);
}

function numericIdList(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} invalide.`);
  const normalized = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (normalized.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`${label} doit contenir uniquement des identifiants numériques séparés par des virgules.`);
  }
  return normalized.join(",");
}

function tokenKey(platform: SupportedPlatform) {
  return platform === "telegram" ? "TELEGRAM_BOT_TOKEN" : "DISCORD_BOT_TOKEN";
}

function allowedUsersKey(platform: SupportedPlatform) {
  return platform === "telegram" ? "TELEGRAM_ALLOWED_USERS" : "DISCORD_ALLOWED_USERS";
}

async function contextResult(dependencies: MessagingDependencies, params: AgentContextParams) {
  const context = await dependencies.contexts.resolve(params);
  if (!context) return result({ error: "Workspace introuvable." }, 404);
  if (!context.agent) return result({ error: "Agent introuvable." }, 404);
  return context;
}

function isApplicationResult(value: AgentRuntimeContext | ApplicationResult): value is ApplicationResult {
  return "status" in value;
}

function auditInput(context: AgentRuntimeContext, action: string, metadata: Record<string, unknown>) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    agentId: context.agent!.id,
    action,
    metadata,
  };
}

/**
 * Vrai quand l'observation est prouvée antérieure à la commande : le runtime n'a pas
 * republié son état, donc un `connected` est celui du process sortant. `waitForState`
 * poll jusqu'à la réécriture, mais rend la main sur timeout — ce garde-fou évite alors
 * d'annoncer un succès. Marqueur absent = indécidable, on ne conclut pas à la péremption.
 */
function staleObservation(marker: string | null, observed: { updated_at?: string | null } | undefined) {
  // Preuve positive exigée : sans marqueur on ne peut rien conclure, mais dès qu'un
  // marqueur existe il faut un `updated_at` présent ET différent pour parler de succès.
  // Un horodatage absent laisse donc l'état non confirmé plutôt que confirmé par défaut.
  if (!marker) return false;
  return !observed?.updated_at || observed.updated_at === marker;
}

function runtimeFailure(dependencies: MessagingDependencies, error: unknown) {
  const failure = dependencies.runtime.classifyError(error);
  return result({ error: failure.message }, failure.status);
}

export function createMessagingUseCases(dependencies: MessagingDependencies) {
  return {
    async get(params: AgentContextParams) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      try {
        const agent = context.agent!;
        return result({
          agent: { id: agent.id, name: agent.name, slug: agent.slug },
          canEdit: canConfigureAgentRuntime(context),
          ...await dependencies.runtime.load(agent.id, agent.hermesProfileName),
        });
      } catch (error) {
        return runtimeFailure(dependencies, error);
      }
    },

    async configure(params: AgentContextParams, body: Record<string, unknown> | null) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      if (!canConfigureAgentRuntime(context)) return result({ error: "Seul un Owner peut configurer les channels." }, 403);
      if (!isSupportedPlatform(body?.platform)) return result({ error: "Channel non pris en charge." }, 400);
      if (typeof body.enabled !== "boolean") return result({ error: "État du channel invalide." }, 400);

      const agent = context.agent!;
      const platform = body.platform;
      const enabled = body.enabled;
      const token = typeof body.token === "string" ? body.token.trim() : "";
      let allowedUsers: string | undefined;
      try {
        allowedUsers = numericIdList(body.allowedUsers, "La liste des utilisateurs autorisés");
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : "Liste invalide." }, 400);
      }
      const replyMode = typeof body.replyMode === "string" ? body.replyMode.trim() : "";
      if (platform === "discord" && replyMode && !["off", "first", "all"].includes(replyMode)) {
        return result({ error: "Mode de réponse Discord invalide." }, 400);
      }

      await dependencies.audit.record(auditInput(context, "messaging.connection_requested", { platform, enabled }));
      let stage = "credential_check";
      try {
        if (enabled && !token) {
          const currentPlatform = (await dependencies.runtime.load(agent.id, agent.hermesProfileName)).platforms
            .find((item) => item.id === platform);
          const credentialSet = currentPlatform?.env_vars?.some((entry) => entry.key === tokenKey(platform) && entry.is_set);
          if (!credentialSet) {
            await dependencies.audit.record(auditInput(context, "messaging.failed", {
              platform, state: stage, error: "Le token du bot est requis.",
            }));
            return result({ error: "Le token du bot est requis." }, 400);
          }
        }
        stage = "control_extension";
        if (platform === "telegram" && enabled) {
          await dependencies.runtime.ensureControlExtension(agent.id, agent.hermesProfileName);
        }
        const env: Record<string, string> = {};
        if (token) env[tokenKey(platform)] = token;
        if (allowedUsers) env[allowedUsersKey(platform)] = allowedUsers;
        if (platform === "discord" && replyMode) env.DISCORD_REPLY_TO_MODE = replyMode;

        stage = "platform_configuration";
        await dependencies.runtime.configure({ agentId: agent.id, profile: agent.hermesProfileName, platform, enabled, env });
        const beforeLifecycle = await dependencies.runtime.load(agent.id, agent.hermesProfileName);
        const lifecycleAction = beforeLifecycle.platforms.some((item) => item.gateway_running) ? "restart" : "start";
        // Marqueur d’avant-commande : `connected` ne compte que s’il a été réécrit depuis.
        const stateMarker = beforeLifecycle.platforms.find((item) => item.id === platform)?.updated_at ?? null;
        let restartWarning: string | null = null;
        stage = "gateway_lifecycle";
        try {
          await dependencies.runtime.lifecycle(agent.id, agent.hermesProfileName, lifecycleAction);
        } catch (error) {
          restartWarning = error instanceof Error ? error.message : "Redémarrage du gateway impossible.";
        }
        stage = "runtime_verification";
        const runtimePlatform = restartWarning ? undefined : enabled
          ? await dependencies.runtime.waitForState(agent.id, agent.hermesProfileName, platform, stateMarker)
          : (await dependencies.runtime.load(agent.id, agent.hermesProfileName)).platforms.find((item) => item.id === platform);
        // `connected` ne prouve que la validité du token (long-polling getUpdates) : sans
        // conversation ouverte avec ce bot, l'envoi échouera en « chat not found ». On sonde
        // la joignabilité réelle avant d'annoncer un succès. `unknown` = indéterminé, on ne bloque pas.
        // Sans `allowedUsers` (token changé seul), la Console ne connaît aucun identifiant :
        // `load()` n'expose que `is_set`, jamais les valeurs. On ne peut pas sonder — et on
        // ne fait pas semblant : `reachabilityChecked` reste false, sans changer `ok`.
        const reachability = platform === "telegram" && enabled && token && allowedUsers
          ? await dependencies.runtime.probeTelegramReachability(token, allowedUsers.split(","))
          : [];
        const reachabilityChecked = reachability.length > 0 && reachability.every((entry) => entry.status !== "unknown");
        const unreachable = reachability.filter((entry) => entry.status === "unreachable");
        if (unreachable.length > 0) {
          await dependencies.audit.record(auditInput(context, "messaging.unreachable", {
            platform,
            lifecycleAction,
            runtimeState: runtimePlatform?.state ?? null,
            reachabilityChecked,
            chatIds: unreachable.map((entry) => entry.chatId),
          }));
          return result({
            ok: false,
            platform,
            state: "unreachable",
            message: "Le bot ne peut pas écrire à ce compte. Ouvre le bot dans Telegram et envoie /start, puis relance la configuration.",
            reachabilityChecked,
            restartWarning,
          });
        }
        // `waitForState` peut rendre la main sur timeout avec l'état d'avant la commande :
        // un `connected` périmé ne vaut pas confirmation.
        const connected = runtimePlatform?.state === "connected" && !staleObservation(stateMarker, runtimePlatform);
        const eventAction = !enabled ? "messaging.disabled" : connected
          ? "messaging.connected" : restartWarning ? "messaging.failed" : "messaging.pending";
        await dependencies.audit.record(auditInput(context, eventAction, {
          platform,
          lifecycleAction,
          runtimeState: runtimePlatform?.state ?? null,
          stateConfirmed: connected,
          reachabilityChecked,
          restartWarning: restartWarning ? dependencies.runtime.classifyError(new Error(restartWarning)).safeMessage : null,
        }));
        return result({
          ok: connected || (!enabled && restartWarning === null),
          platform,
          state: runtimePlatform?.state ?? null,
          reachabilityChecked,
          restartWarning,
        });
      } catch (error) {
        await dependencies.audit.record(auditInput(context, "messaging.failed", {
          platform, state: stage, error: dependencies.runtime.classifyError(error).safeMessage,
        }));
        return runtimeFailure(dependencies, error);
      }
    },

    async action(params: AgentContextParams, body: Record<string, unknown> | null) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      if (!canConfigureAgentRuntime(context)) return result({ error: "Seul un Owner peut piloter le gateway." }, 403);
      const agent = context.agent!;
      try {
        if (body?.action === "test") {
          if (!isSupportedPlatform(body.platform)) return result({ error: "Channel non pris en charge." }, 400);
          const tested = await dependencies.runtime.test(agent.id, agent.hermesProfileName, body.platform);
          const platform = (await dependencies.runtime.load(agent.id, agent.hermesProfileName)).platforms.find((item) => item.id === body.platform);
          let normalized = tested;
          if (platform?.gateway_running && platform.state === "connected" && tested.ok !== true) {
            normalized = { ok: true, state: "connected", message: "Connexion active avec le gateway Hermes." };
          } else if (tested.state === "gateway_stopped") {
            normalized = platform?.gateway_running && platform.state === "connected"
              ? { ok: true, state: "connected", message: "Connexion active avec le gateway Hermes." }
              : { ...tested, message: "Le gateway est arrêté. Démarre-le pour connecter ce channel." };
          } else if (tested.state === "disabled") {
            normalized = { ...tested, message: "Ce channel est désactivé. Active-le puis redémarre le gateway." };
          }
          await dependencies.audit.record(auditInput(context, normalized.ok === true ? "messaging.tested" : "messaging.test_failed", {
            platform: body.platform,
            state: normalized.state ?? platform?.state ?? null,
            detail: normalized.message ?? null,
          }));
          return result(normalized);
        }
        if (body?.action === "telegram_onboarding_start") {
          return result(await dependencies.runtime.telegramStart(agent.id, agent.hermesProfileName, activeBotName(agent.name)));
        }
        if (body?.action === "telegram_onboarding_status") {
          const pairingId = normalizedPairingId(body.pairingId);
          return pairingId
            ? result(await dependencies.runtime.telegramStatus(agent.id, agent.hermesProfileName, pairingId))
            : result({ error: "Session Telegram invalide." }, 400);
        }
        if (body?.action === "telegram_onboarding_apply") {
          const pairingId = normalizedPairingId(body.pairingId);
          if (!pairingId) return result({ error: "Session Telegram invalide." }, 400);
          const allowedUserIds = Array.isArray(body.allowedUserIds)
            ? body.allowedUserIds.filter((value): value is string => typeof value === "string" && /^\d+$/.test(value))
            : [];
          if (allowedUserIds.length === 0) return result({ error: "Hermes n’a pas pu identifier ton compte Telegram." }, 400);
          const applied = await dependencies.runtime.telegramApply(agent.id, agent.hermesProfileName, pairingId, allowedUserIds);
          await dependencies.runtime.ensureControlExtension(agent.id, agent.hermesProfileName);
          let restartWarning: string | null = null;
          try {
            await dependencies.runtime.lifecycle(agent.id, agent.hermesProfileName, "restart");
          } catch (error) {
            restartWarning = error instanceof Error ? error.message : "Redémarrage du gateway impossible.";
          }
          return result({ ...applied, restartWarning });
        }
        if (body?.action === "telegram_onboarding_cancel") {
          const pairingId = normalizedPairingId(body.pairingId);
          return pairingId
            ? result(await dependencies.runtime.telegramCancel(agent.id, agent.hermesProfileName, pairingId))
            : result({ error: "Session Telegram invalide." }, 400);
        }
        if (body?.action === "unblock_telegram") {
          const cleared = await dependencies.runtime.reconcileTelegramLock(agent.id, agent.hermesProfileName);
          if (cleared.status === "unsupported") {
            return result({ error: cleared.reason ?? "Déblocage Telegram indisponible sur ce runtime." }, 400);
          }
          if (cleared.status === "conflict") {
            return result({ error: `Un autre agent (profil ${cleared.profile}) est déjà connecté à ce bot Telegram. S’il s’agit du même bot, retire son token au lieu de forcer le déblocage — sinon les deux se déconnecteraient en boucle.` }, 409);
          }
          if (cleared.status === "ambiguous") {
            return result({ error: "Plusieurs verrous Telegram détectés : impossible de choisir sans risque. Débloque-les sur l’hôte du runtime." }, 409);
          }
          let restartWarning: string | null = null;
          try {
            await dependencies.runtime.lifecycle(agent.id, agent.hermesProfileName, "restart");
          } catch (error) {
            restartWarning = error instanceof Error ? error.message : "Redémarrage du gateway impossible.";
          }
          await dependencies.audit.record(auditInput(context, "messaging.telegram_lock_cleared", {
            platform: "telegram",
            cleared: cleared.status === "cleared",
            restartWarning: restartWarning ? dependencies.runtime.classifyError(new Error(restartWarning)).safeMessage : null,
          }));
          return result({
            ok: restartWarning === null,
            message: cleared.status === "cleared"
              ? "Verrou Telegram résiduel supprimé, le gateway redémarre."
              : "Aucun verrou résiduel à supprimer ; le gateway redémarre.",
            restartWarning,
          });
        }
        if (body?.action === "delete_credential") {
          if (!isSupportedPlatform(body.platform)) return result({ error: "Channel non pris en charge." }, 400);
          const platform = body.platform;
          await dependencies.runtime.deleteCredential(agent.id, agent.hermesProfileName, tokenKey(platform));
          await dependencies.runtime.deleteCredential(agent.id, agent.hermesProfileName, allowedUsersKey(platform)).catch(() => null);
          let restartWarning: string | null = null;
          try {
            await dependencies.runtime.configure({ agentId: agent.id, profile: agent.hermesProfileName, platform, enabled: false, env: {} });
            await dependencies.runtime.lifecycle(agent.id, agent.hermesProfileName, "restart");
          } catch (error) {
            restartWarning = error instanceof Error ? error.message : "Redémarrage du gateway impossible.";
          }
          await dependencies.audit.record(auditInput(context, "messaging.credential_deleted", {
            platform,
            restartWarning: restartWarning ? dependencies.runtime.classifyError(new Error(restartWarning)).safeMessage : null,
          }));
          return result({
            ok: restartWarning === null,
            message: `Credential ${platform === "telegram" ? "Telegram" : "Discord"} supprimé du profil ; le gateway redémarre.`,
            restartWarning,
          });
        }
        if (body?.action === "start" || body?.action === "restart") {
          const state = await dependencies.runtime.load(agent.id, agent.hermesProfileName);
          const telegram = state.platforms.find((platform) => platform.id === "telegram");
          const verifiable = Boolean(telegram?.enabled && telegram.configured);
          if (verifiable) await dependencies.runtime.ensureControlExtension(agent.id, agent.hermesProfileName);
          // Partie C — replug propre au reinstall/reupdate : un gateway confirmé arrêté
          // ne peut pas poller Telegram, donc un verrou token résiduel est orphelin et
          // sûr à purger avant le démarrage. Best-effort, ne bloque jamais le start.
          const gatewayRunning = state.platforms.some((platform) => platform.gateway_running);
          if (body.action === "start" && !gatewayRunning && telegram?.configured) {
            await dependencies.runtime.reconcileTelegramLock(agent.id, agent.hermesProfileName).catch(() => null);
          }
          const lifecycle = await dependencies.runtime.lifecycle(agent.id, agent.hermesProfileName, body.action);
          // Le lifecycle ne prouve rien : l'Edge répond dès que la commande est acceptée et
          // le (re)démarrage est asynchrone. On attend une transition réelle — pas un état,
          // sinon l'ancien process encore vivant nous renverrait son `connected` d'avant.
          const stateMarker = telegram?.updated_at ?? null;
          const verified = verifiable
            ? await dependencies.runtime.waitForState(agent.id, agent.hermesProfileName, "telegram", stateMarker)
            : undefined;
          // `waitForState` rend aussi la main sur timeout, avec l'état d'avant la commande.
          const stale = staleObservation(stateMarker, verified);
          const connected = verified?.state === "connected" && !stale;
          await dependencies.audit.record(auditInput(context,
            body.action === "start" ? "messaging.gateway_started" : "messaging.gateway_restarted",
            { lifecycleAction: body.action, runtimeState: verified?.state ?? null, stateConfirmed: verifiable && connected },
          ));
          if (!verifiable) return result(lifecycle);
          return result({
            ok: connected,
            state: verified?.state ?? null,
            message: stale
              ? `Le runtime n’a pas republié l’état Telegram après la commande : ${body.action === "start" ? "démarrage" : "redémarrage"} non confirmé.`
              : connected
                ? `Gateway ${body.action === "start" ? "démarré" : "redémarré"} : le channel Telegram est connecté.`
                : `Le gateway ne confirme pas la connexion Telegram (état : ${verified?.state ?? "inconnu"}).`,
          });
        }
        return result({ error: "Action gateway invalide." }, 400);
      } catch (error) {
        await dependencies.audit.record(auditInput(context, "messaging.action_failed", {
          platform: isSupportedPlatform(body?.platform) ? body.platform : undefined,
          state: typeof body?.action === "string" ? body.action : "unknown_action",
          error: dependencies.runtime.classifyError(error).safeMessage,
        }));
        return runtimeFailure(dependencies, error);
      }
    },
  };
}
