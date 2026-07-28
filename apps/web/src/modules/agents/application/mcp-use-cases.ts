import { canConfigureAgentRuntime, type AgentContextParams, type AgentRuntimeContext } from "../domain/agent-context";
import { describeMcpFailure } from "../domain/mcp-failure";
import { result, type ApplicationResult } from "./application-result";
import {
  validEnvKey,
  validMcpServerName,
  validMcpUrl,
  type McpDependencies,
  type McpEnvEntry,
} from "./mcp-ports";

const ACTIONS = ["add", "remove", "test", "set_enabled", "install_catalog"] as const;
type McpAction = (typeof ACTIONS)[number];

function isAction(value: unknown): value is McpAction {
  return typeof value === "string" && ACTIONS.includes(value as McpAction);
}

async function contextResult(dependencies: McpDependencies, params: AgentContextParams) {
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

function envEntries(value: unknown): McpEnvEntry[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const entries: McpEnvEntry[] = [];
  for (const item of value) {
    const key = (item as { key?: unknown })?.key;
    const raw = (item as { value?: unknown })?.value;
    if (!validEnvKey(key)) return null;
    if (raw !== undefined && typeof raw !== "string") return null;
    entries.push({ key, value: typeof raw === "string" ? raw : "" });
  }
  return entries;
}

export function createMcpUseCases(dependencies: McpDependencies) {
  /**
   * Pose les valeurs saisies dans le `.env` du profil et ne renvoie que des
   * références `${VAR}` : le runtime écrit `env` en clair dans `config.yaml`
   * (vérifié), donc une valeur passée telle quelle y resterait lisible.
   * Une valeur vide signifie « déjà posée » — on référence sans réécrire.
   */
  async function publishEnv(agentId: string, profile: string, entries: McpEnvEntry[]) {
    const references: Record<string, string> = {};
    for (const entry of entries) {
      const value = entry.value.trim();
      if (value) await dependencies.runtime.setCredential(agentId, profile, entry.key, value);
      references[entry.key] = `\${${entry.key}}`;
    }
    return references;
  }

  return {
    async get(params: AgentContextParams) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      const agent = context.agent!;
      try {
        // Le catalogue est un agrément, pas une dépendance : son indisponibilité
        // ne doit pas masquer les serveurs déjà installés.
        const [servers, catalog] = await Promise.allSettled([
          dependencies.runtime.list(agent.id, agent.hermesProfileName),
          dependencies.runtime.catalog(agent.id, agent.hermesProfileName),
        ]);
        if (servers.status === "rejected") throw servers.reason;
        return result({
          agent: { id: agent.id, name: agent.name, slug: agent.slug },
          canEdit: canConfigureAgentRuntime(context),
          servers: servers.value.servers ?? [],
          catalog: catalog.status === "fulfilled" ? catalog.value.entries ?? [] : [],
          catalogAvailable: catalog.status === "fulfilled",
        });
      } catch (error) {
        const failure = dependencies.runtime.classifyError(error);
        return result({ error: failure.message }, failure.status);
      }
    },

    async command(params: AgentContextParams, body: Record<string, unknown> | null) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      if (!canConfigureAgentRuntime(context))
        return result({ error: "Seul un Owner peut gérer les connecteurs MCP." }, 403);
      if (!isAction(body?.action)) return result({ error: "Action MCP inconnue." }, 400);

      const agent = context.agent!;
      const action = body.action;
      const name = body.name;
      if (!validMcpServerName(name)) return result({ error: "Nom de serveur MCP invalide." }, 400);

      const url = typeof body.url === "string" ? body.url.trim() : "";
      const command = typeof body.command === "string" ? body.command.trim() : "";
      const bearerToken = typeof body.bearerToken === "string" ? body.bearerToken.trim() : "";
      const entries = envEntries(body.env);
      if (entries === null)
        return result(
          {
            error:
              "Variables d’environnement invalides. Les noms détournant le runtime (proxy, PATH, registres de paquets, HERMES_*) sont refusés.",
          },
          400,
        );

      if (action === "add") {
        if (!url && !command) return result({ error: "Renseignez une URL ou une commande." }, 400);
        if (url && command) return result({ error: "Un serveur MCP est soit distant, soit local — pas les deux." }, 400);
        if (url && !validMcpUrl(url)) return result({ error: "URL invalide : http(s) uniquement." }, 400);
        if (url && entries.length)
          return result({ error: "Les variables d’environnement ne s’appliquent qu’aux serveurs locaux." }, 400);
      }
      if (action === "set_enabled" && typeof body.enabled !== "boolean")
        return result({ error: "État d’activation invalide." }, 400);

      await dependencies.audit.record(auditInput(context, "agent.mcp.requested", { action, name }));

      let mutated = false;
      try {
        if (action === "add") {
          const env = await publishEnv(agent.id, agent.hermesProfileName, entries);
          await dependencies.runtime.add(agent.id, agent.hermesProfileName, {
            name,
            url: url || undefined,
            command: command || undefined,
            args: Array.isArray(body.args) ? body.args.filter((a): a is string => typeof a === "string") : undefined,
            env: Object.keys(env).length ? env : undefined,
            bearerToken: bearerToken || undefined,
          });
          mutated = true;
        } else if (action === "remove") {
          await dependencies.runtime.remove(agent.id, agent.hermesProfileName, name);
          mutated = true;
        } else if (action === "set_enabled") {
          await dependencies.runtime.setEnabled(agent.id, agent.hermesProfileName, name, body.enabled as boolean);
          mutated = true;
        } else if (action === "install_catalog") {
          // Une entrée qui déclare une étape d'installation fait cloner un dépôt
          // et exécuter son script de bootstrap via un shell, dans un processus
          // qui hérite de tout l'environnement du runtime — jeton runtime et
          // clés d'inférence compris. On refuse : le catalogue installable en un
          // clic s'arrête aux entrées qui n'ont rien à construire.
          const catalog = await dependencies.runtime.catalog(agent.id, agent.hermesProfileName);
          const entry = catalog.entries.find((candidate) => candidate.name === name);
          if (!entry) return result({ error: "Entrée de catalogue inconnue." }, 404);
          if (entry.needs_install === true)
            return result(
              {
                error:
                  "Cette entrée doit être compilée dans le runtime avant usage : la Console ne déclenche pas de build. Installez-la sur l’hôte, puis déclarez-la comme serveur local.",
              },
              409,
            );
          // Le runtime écrit lui-même les variables du catalogue dans le `.env`
          // du profil : on lui passe donc les valeurs, pas des références.
          const env: Record<string, string> = {};
          for (const entry of entries) if (entry.value.trim()) env[entry.key] = entry.value.trim();
          await dependencies.runtime.installFromCatalog(agent.id, agent.hermesProfileName, {
            name,
            env: Object.keys(env).length ? env : undefined,
            enable: body.enable !== false,
          });
          mutated = true;
        } else {
          const tested = await dependencies.runtime.test(agent.id, agent.hermesProfileName, name);
          const rawFailure = tested.ok === false ? tested.error ?? tested.detail ?? "" : "";
          const failure = rawFailure ? describeMcpFailure(rawFailure, command || null) : null;
          await dependencies.audit.record(
            auditInput(context, failure ? "agent.mcp.test_failed" : "agent.mcp.tested", {
              name,
              ...(failure ? { code: failure.code } : {}),
            }),
          );
          return result({
            ok: !failure,
            name,
            tools: tested.tools ?? [],
            ...(failure ? { failure } : {}),
          });
        }
      } catch (error) {
        const classified = dependencies.runtime.classifyError(error);
        const failure = describeMcpFailure(classified.message, command || null);
        await dependencies.audit.record(
          auditInput(context, "agent.mcp.failed", { action, name, code: failure.code }),
        );
        return result({ error: failure.message, failure }, classified.status);
      }

      // Un serveur MCP n'est chargé qu'au démarrage suivant du gateway. On ne
      // redémarre jamais d'office : la coupure interrompt Telegram, c'est à
      // l'appelant de la déclencher en connaissance de cause.
      let restartWarning: string | null = null;
      let restarted = false;
      if (mutated && body.restart === true) {
        try {
          await dependencies.runtime.lifecycle(agent.id, agent.hermesProfileName, "restart");
          restarted = true;
        } catch (error) {
          restartWarning = dependencies.runtime.classifyError(error).safeMessage;
        }
      }

      await dependencies.audit.record(
        auditInput(context, `agent.mcp.${action === "install_catalog" ? "catalog_installed" : action === "set_enabled" ? "toggled" : action === "add" ? "added" : "removed"}`, {
          name,
          transport: url ? "http" : command ? "stdio" : undefined,
          restarted,
          ...(restartWarning ? { restartWarning } : {}),
        }),
      );

      return result({ ok: true, name, needsRestart: !restarted, restarted, restartWarning });
    },
  };
}
