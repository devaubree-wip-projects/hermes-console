import { z } from "zod";
import { NextResponse } from "next/server";
import {
  createWorkspaceWorkResource,
  minimumRoleForWorkResource,
} from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  kind: z.enum(["link", "file", "knowledge", "artifact"]),
  name: z.string().min(1).max(240),
  uri: z.string().min(1).max(2_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; projectId: string }> }) {
  try {
    const { tenantSlug, projectId } = await params;
    const body = schema.parse(await readJson(request));
    const context = await resolveWorkContext(
      tenantSlug,
      minimumRoleForWorkResource(body.kind, body.uri),
    );
    return NextResponse.json({ resource: await createWorkspaceWorkResource({ context, projectId, ...body }) }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}
