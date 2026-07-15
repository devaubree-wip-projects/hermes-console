import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { probeGateway } from "@/lib/hermes/gateway-preflight";
import { validateGatewayUrl } from "@/lib/hermes/gateway-url";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

const INSTALLATION_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
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
    const result = await probeGateway(gatewayUrl, installationKey);
    return NextResponse.json({ preflight: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Préflight impossible.",
    }, { status: 400 });
  }
}
