import { z } from "zod";
import { NextResponse } from "next/server";
import {
  deleteWorkspaceProject,
  updateWorkspaceProject,
} from "@/modules/work/infrastructure/project-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(10_000).optional(),
  status: z.enum(["planned", "active", "paused", "completed", "cancelled"]).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
});

type Params = { tenantSlug: string; projectId: string };

export async function PATCH(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, projectId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    const body = patchSchema.parse(await readJson(request));
    const project = await updateWorkspaceProject({
      context,
      projectId,
      name: body.name,
      description: body.description,
      status: body.status,
      dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
    });
    return NextResponse.json({ project });
  } catch (error) { return workErrorResponse(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, projectId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    await deleteWorkspaceProject({ context, projectId });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}
