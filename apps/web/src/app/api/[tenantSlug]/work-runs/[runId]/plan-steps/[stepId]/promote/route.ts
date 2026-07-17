import { NextResponse } from "next/server";
import { promoteWorkspacePlanStep } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function POST(_: Request, { params }: { params: Promise<{ tenantSlug: string; runId: string; stepId: string }> }) {
  try {
    const { tenantSlug, runId, stepId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    return NextResponse.json({ item: await promoteWorkspacePlanStep({ context, runId, stepId }) }, { status: 201 });
  } catch (error) {
    return workErrorResponse(error);
  }
}
