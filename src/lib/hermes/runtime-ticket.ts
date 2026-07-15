import "server-only";
import { createHmac } from "node:crypto";
import type { MembershipRole } from "@/db/schema";

const BRIDGE_SECRET = process.env.HERMES_BRIDGE_SECRET ?? "hermes-console-local-development";

export function createRuntimeTicket(input: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  profile: string;
  role: MembershipRole;
}) {
  const encoded = Buffer.from(
    JSON.stringify({ ...input, exp: Date.now() + 60_000 }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", BRIDGE_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
