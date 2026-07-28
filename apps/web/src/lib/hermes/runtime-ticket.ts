import "server-only";
import { createHmac } from "node:crypto";
import type { MembershipRole } from "@/db/schema";
import { resolveInstallationSecret } from "@/lib/hermes/installation-secrets";

export async function createRuntimeTicket(input: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  installationKey: string;
  profile: string;
  role: MembershipRole;
  modelOverride?: string;
}) {
  const now = Date.now();
  const { installationKey, ...claims } = input;
  const encoded = Buffer.from(
    JSON.stringify({
      version: 1,
      ...claims,
      // Le gateway Go lit cette valeur sous le nom `installationId` et la compare à
      // sa propre clé d'installation (apps/gateway/gateway/auth.go:63). Le champ JSON
      // porte donc un nom trompeur — il transporte la CLÉ, pas l'UUID. Seul le nom
      // TypeScript est corrigé : renommer la propriété sérialisée invaliderait tous
      // les tickets côté Edge.
      installationId: installationKey,
      iat: now,
      exp: now + 60_000,
    }),
    "utf8",
  ).toString("base64url");
  const secret = await resolveInstallationSecret("ticket", installationKey);
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
