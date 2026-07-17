import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, workItems, workRuns } from "@/db/schema";
import {
  getWorkspaceWorkItem,
  placeWorkspaceWorkItem,
  updateWorkspaceWorkItem,
  WorkConflictError,
  WorkNotFoundError,
} from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const patchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  description: z.string().max(40_000).optional(),
  status: z.enum(["backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled"]).optional(),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
  projectId: z.string().uuid().nullable().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  reviewPolicy: z.enum(["none", "optional", "required"]).optional(),
  placement: z.object({
    previousItemId: z.string().uuid().nullable(),
    nextItemId: z.string().uuid().nullable(),
  }).optional(),
}).refine((body) => !body.placement || Boolean(body.status), {
  message: "Le statut cible est requis pour ordonner une tâche.",
  path: ["status"],
});

type Params = { tenantSlug: string; workItemId: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug);
    const query = new URL(request.url).searchParams;
    const runLimit = Math.min(Math.max(Number(query.get("runLimit") ?? 50) || 50, 1), 200);
    const runOffset = Math.min(Math.max(Number(query.get("runOffset") ?? 0) || 0, 0), 100_000);
    return NextResponse.json(await getWorkspaceWorkItem(context.workspaceId, workItemId, { runLimit, runOffset }));
  } catch (error) {
    return workErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    const body = patchSchema.parse(await readJson(request));
    if (body.placement && body.status) {
      const item = await placeWorkspaceWorkItem({
        context,
        workItemId,
        status: body.status,
        ...body.placement,
      });
      return NextResponse.json({ item });
    }
    const item = await updateWorkspaceWorkItem({
      context,
      workItemId,
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      projectId: body.projectId,
      reviewPolicy: body.reviewPolicy,
      dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return workErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const { tenantSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, "member");
    const [item] = await db.select().from(workItems).where(and(eq(workItems.id, workItemId), eq(workItems.workspaceId, context.workspaceId))).limit(1);
    if (!item) throw new WorkNotFoundError("Tâche introuvable.");
    const active = await db.select({ id: workRuns.id }).from(workRuns).where(and(
      eq(workRuns.workItemId, item.id),
      inArray(workRuns.status, ["queued", "preparing", "running", "waiting_input", "cancelling"]),
    )).limit(1);
    if (active[0]) throw new WorkConflictError("Annulez le run actif avant de supprimer la tâche.");
    await db.transaction(async (tx) => {
      await tx.delete(workItems).where(eq(workItems.id, item.id));
      await tx.insert(auditEvents).values({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        action: "work_item.deleted",
        targetType: "work_item",
        targetId: item.id,
        metadata: { key: item.key },
      });
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return workErrorResponse(error);
  }
}
