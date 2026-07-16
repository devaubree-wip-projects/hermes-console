import { NextResponse } from "next/server";
import { cancelWorkspaceWorkRun } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function POST(_: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; runId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, runId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    return NextResponse.json({ run: await cancelWorkspaceWorkRun({ context, runId }) });
  } catch (error) {
    return workErrorResponse(error);
  }
}
