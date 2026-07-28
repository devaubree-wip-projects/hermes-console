import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { TenantRouteParams } from "@hermes-console/shared";
import { db } from "@/db";
import { auditEvents, consoleSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sealSecret } from "@/lib/hermes/secret-vault";
import { CONSOLE_SETTING_KEYS, consoleSettingDefinition } from "@/lib/settings/catalog";
import {
  invalidateSettings,
  overridesDisabled,
  resolveAllSettings,
  settingContext,
} from "@/lib/settings/resolve";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

/**
 * Réglages d'instance. Ils ne dépendent pas du tenant — la route est sous un tenant
 * pour réutiliser le contrôle d'accès, mais un seul rôle peut les lire ou les écrire.
 */
async function requireOwner(params: Promise<TenantRouteParams>) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return { error: NextResponse.json({ error: "Workspace introuvable." }, { status: 404 }) };
  if (!canConfigureRuntime(access.role)) {
    return { error: NextResponse.json({ error: "Seul un Owner peut modifier les réglages d’instance." }, { status: 403 }) };
  }
  return { user, access };
}

export async function GET(request: Request, { params }: { params: Promise<TenantRouteParams> }) {
  const guard = await requireOwner(params);
  if (guard.error) return guard.error;
  const resolved = await resolveAllSettings(CONSOLE_SETTING_KEYS);
  return NextResponse.json({
    overridesDisabled: overridesDisabled(),
    settings: resolved.map((setting) => ({
      key: setting.key,
      source: setting.source,
      isSecret: setting.isSecret,
      // Un secret n'est jamais renvoyé, même à un Owner : on dit seulement s'il est
      // défini. Le lire depuis l'interface le ferait transiter et journaliser.
      value: setting.isSecret ? null : setting.value,
      defined: Boolean(setting.value),
    })),
  });
}

export async function PUT(request: Request, { params }: { params: Promise<TenantRouteParams> }) {
  const guard = await requireOwner(params);
  if (guard.error) return guard.error;
  const body = await request.json().catch(() => null) as { key?: unknown; value?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  const definition = consoleSettingDefinition(key);
  if (!definition) {
    return NextResponse.json({ error: "Ce réglage n’est pas surchargeable." }, { status: 400 });
  }
  // null efface la surcharge et rend la main à l'environnement.
  const raw = body?.value === null ? null : typeof body?.value === "string" ? body.value : undefined;
  if (raw === undefined) {
    return NextResponse.json({ error: "Valeur invalide." }, { status: 400 });
  }
  if (raw !== null && raw.length > 4096) {
    return NextResponse.json({ error: "Valeur trop longue." }, { status: 400 });
  }

  const now = new Date();
  if (raw === null) {
    await db.delete(consoleSettings).where(eq(consoleSettings.key, key));
  } else {
    const secret = definition.secret === true;
    const values = {
      key,
      value: secret ? null : raw,
      valueEncrypted: secret ? sealSecret(raw, settingContext(key)) : null,
      isSecret: secret,
      updatedByUserId: guard.user.id,
      updatedAt: now,
    };
    await db.insert(consoleSettings).values(values).onConflictDoUpdate({
      target: consoleSettings.key,
      set: values,
    });
  }
  invalidateSettings();

  await db.insert(auditEvents).values({
    tenantId: guard.access.tenant.id,
    workspaceId: guard.access.workspace.id,
    actorUserId: guard.user.id,
    action: raw === null ? "console_setting.cleared" : "console_setting.updated",
    targetType: "console_setting",
    targetId: null,
    // Jamais la valeur : le journal d'audit est lisible, et un secret n'y a pas sa
    // place. Le nom du réglage suffit à retracer qui a changé quoi.
    metadata: { key, isSecret: definition.secret === true },
  });

  return NextResponse.json({ ok: true, key, source: raw === null ? "environment" : "database" });
}
