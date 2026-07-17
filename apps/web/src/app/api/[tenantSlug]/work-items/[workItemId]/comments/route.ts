import { z } from "zod";
import { NextResponse } from "next/server";
import { addWorkspaceWorkComment, getWorkspaceWorkItem } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ content: z.string().min(1).max(20_000) });

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug);
    const detail = await getWorkspaceWorkItem(context.workspaceId, workItemId);
    return NextResponse.json({ comments: detail.comments });
  } catch (error) {
    return workErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    const body = schema.parse(await readJson(request));
    return NextResponse.json(await addWorkspaceWorkComment({ context, workItemId, content: body.content }), { status: 201 });
  } catch (error) {
    return workErrorResponse(error);
  }
}
