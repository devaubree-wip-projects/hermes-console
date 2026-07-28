import { NextResponse } from "next/server";
import { deleteWorkspaceAgentTeam } from "@/modules/work/infrastructure/work-service";
import {
  resolveWorkContext,
  workErrorResponse,
} from "@/modules/work/presentation/http";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ tenantSlug: string; teamId: string }> },
) {
  try {
    const { tenantSlug, teamId } = await params;
    const context = await resolveWorkContext(tenantSlug, "owner");
    return NextResponse.json({
      team: await deleteWorkspaceAgentTeam({ context, teamId }),
    });
  } catch (error) {
    return workErrorResponse(error);
  }
}
