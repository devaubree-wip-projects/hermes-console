import { z } from "zod";
import { NextResponse } from "next/server";
import { assignWorkspaceWorkItem } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  type: z.enum(["user", "agent", "team"]).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const assignee = schema.parse(await readJson(request));
    return NextResponse.json(await assignWorkspaceWorkItem({ context, workItemId, assignee }));
  } catch (error) {
    return workErrorResponse(error);
  }
}
