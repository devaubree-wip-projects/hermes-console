import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { HermesRuntimeError, updateRuntimeAccess, type ApprovalMode } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

const APPROVAL_MODES: ApprovalMode[] = ["manual", "smart", "off"];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut modifier le runtime." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    profile?: unknown;
    approvalMode?: unknown;
    defaultCwd?: unknown;
  } | null;

  const profile = typeof body?.profile === "string" ? body.profile.trim() : "";
  if (!profile) return NextResponse.json({ error: "Profil Hermes manquant." }, { status: 400 });

  const patch: { approvalMode?: ApprovalMode; defaultCwd?: string } = {};

  if (body?.approvalMode !== undefined) {
    if (!APPROVAL_MODES.includes(body.approvalMode as ApprovalMode)) {
      return NextResponse.json({ error: "Mode d'approbation invalide." }, { status: 400 });
    }
    patch.approvalMode = body.approvalMode as ApprovalMode;
  }

  if (body?.defaultCwd !== undefined) {
    if (typeof body.defaultCwd !== "string" || !body.defaultCwd.trim()) {
      return NextResponse.json({ error: "Répertoire de travail invalide." }, { status: 400 });
    }
    patch.defaultCwd = body.defaultCwd.trim();
  }

  if (patch.approvalMode === undefined && patch.defaultCwd === undefined) {
    return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
  }

  try {
    await updateRuntimeAccess(profile, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof HermesRuntimeError && error.status ? error.status : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Runtime Hermes indisponible." },
      { status },
    );
  }
}
