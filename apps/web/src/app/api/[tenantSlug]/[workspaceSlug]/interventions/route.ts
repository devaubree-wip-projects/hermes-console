import { NextResponse } from "next/server";
import { listWorkspaceInterventions } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    return NextResponse.json({ interventions: await listWorkspaceInterventions(context.workspaceId) });
  } catch (error) { return workErrorResponse(error); }
}
