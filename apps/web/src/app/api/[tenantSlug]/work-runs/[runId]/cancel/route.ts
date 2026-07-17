import { NextResponse } from "next/server";
import { cancelWorkspaceWorkRun } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function POST(_: Request, { params }: { params: Promise<{ tenantSlug: string; runId: string }> }) {
  try {
    const { tenantSlug, runId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    return NextResponse.json({ run: await cancelWorkspaceWorkRun({ context, runId }) });
  } catch (error) {
    return workErrorResponse(error);
  }
}
