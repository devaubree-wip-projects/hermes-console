import { z } from "zod";
import { setWorkspaceWorkItemLabel } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ labelId: z.string().uuid() });
type Params = { tenantSlug: string; workspaceSlug: string; workItemId: string };

async function mutate(request: Request, params: Promise<Params>, attached: boolean) {
  try {
    const { tenantSlug, workspaceSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const { labelId } = schema.parse(await readJson(request));
    await setWorkspaceWorkItemLabel({ context, workItemId, labelId, attached });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<Params> }) { return mutate(request, params, true); }
export async function DELETE(request: Request, { params }: { params: Promise<Params> }) { return mutate(request, params, false); }
