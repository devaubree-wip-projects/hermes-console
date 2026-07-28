import { z } from "zod";
import { NextResponse } from "next/server";
import { createWorkspaceSavedView, deleteWorkspaceSavedView, listWorkspaceSavedViews } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const createSchema = z.object({ name: z.string().min(1).max(80), filters: z.record(z.string(), z.string().max(240)) });
const deleteSchema = z.object({ viewId: z.string().uuid() });

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveWorkContext(tenantSlug);
    return NextResponse.json({ views: await listWorkspaceSavedViews(context.workspaceId, context.userId) });
  } catch (error) { return workErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveWorkContext(tenantSlug);
    return NextResponse.json({ view: await createWorkspaceSavedView({ context, ...createSchema.parse(await readJson(request)) }) }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveWorkContext(tenantSlug);
    await deleteWorkspaceSavedView({ context, ...deleteSchema.parse(await readJson(request)) });
    return new Response(null, { status: 204 });
  } catch (error) { return workErrorResponse(error); }
}
