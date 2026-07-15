import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; name: string }> },
) {
  const { tenantSlug, workspaceSlug, name } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut modifier les outils." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : null;
  const profile = typeof body?.profile === "string" ? body.profile.trim() : "";
  if (enabled === null || !profile) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  try {
    const result = await hermesFetch<{ ok: boolean; name: string; enabled: boolean }>(
      `/api/tools/toolsets/${encodeURIComponent(name)}?profile=${encodeURIComponent(profile)}`,
      { method: "PUT", body: JSON.stringify({ enabled, profile }) },
    );
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof HermesRuntimeError && error.status ? error.status : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Runtime Hermes indisponible." },
      { status },
    );
  }
}
