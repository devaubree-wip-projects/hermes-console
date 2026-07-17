import { NextResponse } from "next/server";
import { cancelWorkspaceWorkItem } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function POST(_: Request, { params }: { params: Promise<{ tenantSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    return NextResponse.json(await cancelWorkspaceWorkItem({ context, workItemId }));
  } catch (error) {
    return workErrorResponse(error);
  }
}
