import { deleteWorkspaceWorkResource } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function DELETE(_: Request, { params }: { params: Promise<{ tenantSlug: string; resourceId: string }> }) {
  try {
    const { tenantSlug, resourceId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    await deleteWorkspaceWorkResource({ context, resourceId });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}
