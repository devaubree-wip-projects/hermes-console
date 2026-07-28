import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { probeGateway } from "@/lib/hermes/gateway-preflight";
import { validateGatewayUrl } from "@/lib/hermes/gateway-url";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

const INSTALLATION_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut vérifier une installation." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { gatewayUrl?: unknown; installationKey?: unknown } | null;
  const installationKey = typeof body?.installationKey === "string" ? body.installationKey.trim() : "";
  if (!INSTALLATION_KEY.test(installationKey)) {
    return NextResponse.json({ error: "Clé d’installation invalide." }, { status: 400 });
  }
  try {
    const gatewayUrl = validateGatewayUrl(typeof body?.gatewayUrl === "string" ? body.gatewayUrl.trim() : "");
    // Sondage avant enregistrement : aucune ligne d'installation n'existe encore.
    const result = await probeGateway(gatewayUrl, installationKey, "unregistered");
    return NextResponse.json({ preflight: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Préflight impossible.",
    }, { status: 400 });
  }
}
