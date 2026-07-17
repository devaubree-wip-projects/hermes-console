import { NextResponse } from "next/server";
import { getWorkTimeline } from "@/modules/work/infrastructure/work-service";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

export async function GET(request: Request, { params }: { params: Promise<{ tenantSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug);
    const query = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(query.get("limit") ?? 50) || 50, 1), 200);
    const offset = Math.min(Math.max(Number(query.get("offset") ?? 0) || 0, 0), 100_000);
    const timeline = await getWorkTimeline(context.workspaceId, workItemId, { limit, offset });
    return NextResponse.json({ timeline: timeline.slice(0, limit), pagination: { limit, offset, hasMore: timeline.length > limit } });
  } catch (error) {
    return workErrorResponse(error);
  }
}
