import { deleteWorkspaceWorkResource } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function DELETE(_: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; resourceId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, resourceId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    await deleteWorkspaceWorkResource({ context, resourceId });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}
