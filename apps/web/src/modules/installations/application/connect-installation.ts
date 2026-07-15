import { result } from "@/modules/agents/application/application-result";
import { INSTALLATION_KEY_PATTERN, type InstallationManagementLevel } from "../domain/installation";
import type { InstallationDependencies } from "./ports";

export function createConnectInstallation(dependencies: InstallationDependencies) {
  return async function connectInstallation(
    params: { tenantSlug: string; workspaceSlug: string },
    body: Record<string, unknown> | null,
  ) {
    const context = await dependencies.contexts.resolveWorkspace(params);
    if (!context) return result({ error: "Workspace introuvable." }, 404);
    if (context.role !== "owner") return result({ error: "Seul un Owner peut connecter une installation." }, 403);

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const installationKey = typeof body?.installationKey === "string" ? body.installationKey.trim() : "";
    const agentId = typeof body?.agentId === "string" ? body.agentId : "";
    const profileName = typeof body?.profileName === "string" ? body.profileName.trim() : "";
    const managementLevel: InstallationManagementLevel = body?.managementLevel === "connected" ? "connected" : "external";
    if (!name || name.length > 100 || !INSTALLATION_KEY_PATTERN.test(installationKey)) {
      return result({ error: "Nom ou clé d’installation invalide." }, 400);
    }

    try {
      const gatewayUrl = dependencies.gateway.validateUrl(typeof body?.gatewayUrl === "string" ? body.gatewayUrl.trim() : "");
      const probe = await dependencies.gateway.probe(gatewayUrl, installationKey);
      if (managementLevel === "connected" && !probe.lifecycle.includes("restart")) {
        return result({ error: "Ce Edge n’annonce pas la capacité de gestion demandée." }, 400);
      }
      if (agentId && !probe.profiles.some((profile) => profile.name === profileName)) {
        return result({ error: "Le profil choisi n’a pas été découvert sur cette installation." }, 400);
      }
      if (probe.status === "ready") {
        if (!probe.features.includes("runtime.profile-test")) {
          return result({ error: "Ce Edge ne sait pas valider un profil avec une session éphémère nettoyée." }, 400);
        }
        const validationProfile = profileName || probe.profiles[0]?.name;
        if (!validationProfile) return result({ error: "Aucun profil Hermes ne peut être validé." }, 400);
        await dependencies.gateway.testProfile(gatewayUrl, installationKey, validationProfile);
      }
      const initialCapacity = dependencies.gateway.capacity(probe.system, probe.profiles.length);
      if (agentId && dependencies.gateway.isSaturated(initialCapacity)) {
        return result({
          error: "Headroom runtime insuffisant pour associer immédiatement une nouvelle charge.",
          code: "capacity_headroom_exceeded",
        }, 409);
      }
      const installation = await dependencies.repository.connect({
        context, name, installationKey, gatewayUrl, managementLevel, probe, initialCapacity, agentId, profileName,
      });
      return result({ installation }, 201);
    } catch (error) {
      const failure = dependencies.repository.classifyError(error);
      return result({ error: failure.message }, failure.status);
    }
  };
}
