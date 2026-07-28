import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workChangeBroadcaster, type WorkChangeSubscription } from "@/lib/work/work-change-broadcaster";
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

export async function GET(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  try {
    const { tenantSlug } = await params;
    const context = await resolveWorkContext(tenantSlug);
    const { workItemId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (workItemId && !await workItemExists(context.workspaceId, workItemId)) return new Response("Tâche introuvable.", { status: 404 });
    const encoder = new TextEncoder();
    let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
    let subscription: WorkChangeSubscription | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (closed) return;
          closed = true;
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          subscription?.unsubscribe();
          try { controller.close(); } catch { /* already closed */ }
        };
        const send = (chunk: string) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(chunk)); } catch { close(); }
        };
        send("retry: 3000\n\n");
        request.signal.addEventListener("abort", close, { once: true });
        subscription = workChangeBroadcaster.subscribe({ workspaceId: context.workspaceId, workItemId }, (change) => {
          send(`event: work.changed\ndata: ${JSON.stringify({ workItemId: change.workItemId, source: change.source })}\n\n`);
        });
        if (closed) subscription.unsubscribe();
        subscription.ready.then(() => {
          send(`event: work.changed\ndata: ${JSON.stringify({ workItemId, source: "snapshot" })}\n\n`);
        }).catch(close);
        keepAliveTimer = setInterval(() => send(": keepalive\n\n"), 15_000);
      },
      cancel() {
        closed = true;
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        subscription?.unsubscribe();
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
