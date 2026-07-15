import { and, eq, isNull, lt, or } from "drizzle-orm";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { db } from "../src/db";
import { auditEvents, runtimeBackups, runtimeInstallations } from "../src/db/schema";

async function backupCommand(
  installation: typeof runtimeInstallations.$inferSelect,
  input: { action: "verify" | "delete"; profile: string; backupId: string },
) {
  const requestUri = "/v1/control/backup";
  const endpoint = `${installation.gatewayUrl.replace(/\/$/, "")}${requestUri}`;
  const body = JSON.stringify({ ...input, includeSecrets: false });
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = ["POST", requestUri, String(timestamp), nonce, input.profile, digest].join("\n");
  const master = process.env.HERMES_GATEWAY_SERVICE_SECRET
    ?? process.env.HERMES_GATEWAY_TICKET_SECRET
    ?? "hermes-console-local-development";
  const secret = process.env.HERMES_GATEWAY_DERIVE_SECRETS === "false"
    ? master
    : createHmac("sha256", master).update(`hermes-console:service:${installation.installationKey}`).digest("base64url");
  const signature = createHmac("sha256", secret).update(canonical).digest("base64url");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hermes-Timestamp": String(timestamp),
      "X-Hermes-Nonce": nonce,
      "X-Hermes-Signature": signature,
      "X-Hermes-Profile": input.profile,
      "X-Hermes-Installation-Id": installation.installationKey,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error((await response.text()).trim() || `Edge ${response.status}`);
}

const now = new Date();
const verifyBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const rows = await db.select({ backup: runtimeBackups, installation: runtimeInstallations })
  .from(runtimeBackups)
  .innerJoin(runtimeInstallations, eq(runtimeInstallations.id, runtimeBackups.installationId))
  .where(and(
    eq(runtimeInstallations.managementLevel, "managed"),
    eq(runtimeBackups.status, "ready"),
    or(
      isNull(runtimeBackups.verifiedAt),
      lt(runtimeBackups.verifiedAt, verifyBefore),
      lt(runtimeBackups.retentionUntil, now),
    ),
  ));

let verified = 0;
let expired = 0;
let failed = 0;
for (const { backup, installation } of rows) {
  try {
    if (backup.retentionUntil && backup.retentionUntil <= now) {
      await backupCommand(installation, { action: "delete", profile: backup.profileName, backupId: backup.id });
      await db.update(runtimeBackups).set({ status: "expired" }).where(eq(runtimeBackups.id, backup.id));
      expired++;
      continue;
    }
    await backupCommand(installation, { action: "verify", profile: backup.profileName, backupId: backup.id });
    await db.update(runtimeBackups).set({ verifiedAt: now }).where(eq(runtimeBackups.id, backup.id));
    verified++;
  } catch (error) {
    failed++;
    await db.update(runtimeBackups).set({ status: "failed" }).where(eq(runtimeBackups.id, backup.id));
    await db.insert(auditEvents).values({
      tenantId: installation.tenantId,
      actorUserId: null,
      action: "runtime_backup.maintenance_failed",
      targetType: "runtime_installation",
      targetId: installation.id,
      metadata: {
        backupId: backup.id,
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      },
    });
  }
}

console.log(JSON.stringify({ checked: rows.length, verified, expired, failed }));
process.exit(failed > 0 ? 1 : 0);
