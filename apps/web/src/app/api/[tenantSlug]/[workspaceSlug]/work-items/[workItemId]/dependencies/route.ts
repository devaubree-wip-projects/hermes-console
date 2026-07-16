import { z } from "zod";
import { NextResponse } from "next/server";
import {
  addWorkspaceWorkDependency,
  removeWorkspaceWorkDependency,
} from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ dependsOnWorkItemId: z.string().uuid() });
type Params = { tenantSlug: string; workspaceSlug: string; workItemId: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, workspaceSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = schema.parse(await readJson(request));
    const dependency = await addWorkspaceWorkDependency({ context, workItemId, ...body });
    return NextResponse.json({ dependency }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, workspaceSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = schema.parse(await readJson(request));
    await removeWorkspaceWorkDependency({ context, workItemId, ...body });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}
