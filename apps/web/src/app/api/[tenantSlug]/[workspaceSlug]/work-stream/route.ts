import { sql } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import { db } from "@/db";
import { resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const querySchema = z.object({ workItemId: z.string().uuid().optional() });

async function workItemExists(workspaceId: string, workItemId: string) {
  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS(
      SELECT 1 FROM work_items
      WHERE workspace_id = ${workspaceId} AND id = ${workItemId}
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

export async function GET(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    const { workItemId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (workItemId && !await workItemExists(context.workspaceId, workItemId)) return new Response("Tâche introuvable.", { status: 404 });
    const encoder = new TextEncoder();
    let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
    const listenerSql = postgres(process.env.DATABASE_URL!, { max: 1 });
    let listener: Awaited<ReturnType<typeof listenerSql.listen>> | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
        const close = () => {
          if (closed) return;
          closed = true;
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          void listener?.unlisten().catch(() => undefined);
          void listenerSql.end({ timeout: 1 }).catch(() => undefined);
          try { controller.close(); } catch { /* already closed */ }
        };
        request.signal.addEventListener("abort", close, { once: true });
        void listenerSql.listen("hermes_work_changed", (value) => {
          if (closed) return;
          try {
            const change = JSON.parse(value) as { workspaceId?: string; workItemId?: string; source?: string };
            if (change.workspaceId === context.workspaceId && (!workItemId || change.workItemId === workItemId)) {
              controller.enqueue(encoder.encode(`event: work.changed\ndata: ${JSON.stringify({ workItemId, source: change.source })}\n\n`));
            }
          } catch { /* malformed notifications are ignored */ }
        }).then((activeListener) => {
          listener = activeListener;
          if (!closed) controller.enqueue(encoder.encode(`event: work.changed\ndata: ${JSON.stringify({ workItemId, source: "snapshot" })}\n\n`));
        }).catch(close);
        keepAliveTimer = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);
      },
      cancel() {
        closed = true;
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        void listener?.unlisten().catch(() => undefined);
        void listenerSql.end({ timeout: 1 }).catch(() => undefined);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return workErrorResponse(error);
  }
}
