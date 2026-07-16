import { z } from "zod";
import { NextResponse } from "next/server";
import { createWorkspaceWorkResource } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  kind: z.enum(["link", "file", "knowledge", "artifact"]),
  name: z.string().min(1).max(240),
  uri: z.string().min(1).max(2_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = schema.parse(await readJson(request));
    return NextResponse.json({ resource: await createWorkspaceWorkResource({ context, workItemId, ...body }) }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}
