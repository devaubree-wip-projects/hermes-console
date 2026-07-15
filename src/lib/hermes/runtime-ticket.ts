import "server-only";
import { createHmac } from "node:crypto";
import type { MembershipRole } from "@/db/schema";
import { deriveInstallationSecret, gatewayTicketMasterSecret } from "@/lib/hermes/relay-identity";

export function createRuntimeTicket(input: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  installationId: string;
  profile: string;
  role: MembershipRole;
  modelOverride?: string;
}) {
  const now = Date.now();
  const encoded = Buffer.from(
    JSON.stringify({ version: 1, ...input, iat: now, exp: now + 60_000 }),
    "utf8",
  ).toString("base64url");
  const secret = process.env.HERMES_GATEWAY_DERIVE_SECRETS !== "false"
    ? deriveInstallationSecret("ticket", input.installationId)
    : gatewayTicketMasterSecret();
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
