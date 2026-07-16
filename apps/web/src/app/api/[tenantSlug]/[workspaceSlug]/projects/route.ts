import { z } from "zod";
import { NextResponse } from "next/server";
import { createWorkspaceProject, listWorkspaceProjects } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ key: z.string().min(1).max(24), name: z.string().min(1).max(160), description: z.string().max(10_000).optional() });

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    return NextResponse.json({ projects: await listWorkspaceProjects(context.workspaceId) });
  } catch (error) { return workErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = schema.parse(await readJson(request));
    return NextResponse.json({ project: await createWorkspaceProject({ context, ...body }) }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}
