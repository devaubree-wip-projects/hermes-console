import { z } from "zod";
import { NextResponse } from "next/server";
import {
  deleteWorkspaceAutomation,
  updateWorkspaceAutomation,
} from "@/modules/work/infrastructure/automation-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const patchSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

type Params = { tenantSlug: string; automationId: string };

export async function PATCH(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, automationId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    const body = patchSchema.parse(await readJson(request));
    const automation = await updateWorkspaceAutomation({ context, automationId, ...body });
    return NextResponse.json({ automation });
  } catch (error) { return workErrorResponse(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, automationId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    await deleteWorkspaceAutomation({ context, automationId });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}
