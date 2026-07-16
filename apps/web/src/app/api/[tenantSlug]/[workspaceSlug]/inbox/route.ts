import { z } from "zod";
import { NextResponse } from "next/server";
import { listWorkspaceInbox, markWorkspaceInbox } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() });

export async function GET(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    const query = new URL(request.url).searchParams;
    const unreadOnly = query.get("unread") === "1";
    const limit = Math.min(Math.max(Number(query.get("limit") ?? 50) || 50, 1), 200);
    const offset = Math.min(Math.max(Number(query.get("offset") ?? 0) || 0, 0), 100_000);
    const rows = await listWorkspaceInbox({ workspaceId: context.workspaceId, userId: context.userId, unreadOnly, limit: limit + 1, offset });
    return NextResponse.json({ items: rows.slice(0, limit), pagination: { limit, offset, hasMore: rows.length > limit } });
  } catch (error) { return workErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    const body = schema.parse(await readJson(request));
    return NextResponse.json({ items: await markWorkspaceInbox({ workspaceId: context.workspaceId, userId: context.userId, ...body }) });
  } catch (error) { return workErrorResponse(error); }
}
