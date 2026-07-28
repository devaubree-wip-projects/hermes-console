import { randomBytes } from "node:crypto";

export type InstallationManagementLevel = "external" | "connected" | "managed";

export const INSTALLATION_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

/**
 * Le secret de service d'un Edge est dérivé de sa clé d'installation. Deux tenants
 * partageant une clé partageraient donc ce secret, et l'un pourrait s'authentifier
 * à la place de l'autre. Toute nouvelle installation reçoit donc une clé générée
 * côté serveur : l'unicité n'est plus une convention, c'est une propriété.
 *
 * Fonction pure et sans `server-only` : le seed s'exécute hors Next.js.
 */
export function generateInstallationKey() {
  return `edge_${randomBytes(24).toString("base64url")}`;
}
