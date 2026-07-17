import { z } from "zod";
import { NextResponse } from "next/server";
import { createWorkspaceWorkLabel, listWorkspaceWorkLabels } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ name: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveWorkContext(tenantSlug);
    return NextResponse.json({ labels: await listWorkspaceWorkLabels(context.workspaceId) });
  } catch (error) { return workErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, "owner");
    return NextResponse.json({ label: await createWorkspaceWorkLabel({ context, ...schema.parse(await readJson(request)) }) }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}
