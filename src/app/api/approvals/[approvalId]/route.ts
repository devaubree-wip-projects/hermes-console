import { eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canApprove, getWorkspaceAccessForUserById } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { decision } = (body ?? {}) as { decision?: unknown };
  if (decision !== "approved" && decision !== "rejected") {
    return Response.json({ error: "Décision invalide." }, { status: 400 });
  }

  const { approvalId } = await params;
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  if (!approval) {
    return Response.json({ error: "Validation introuvable." }, { status: 404 });
  }

  const access = await getWorkspaceAccessForUserById(approval.workspaceId, user.id);
  if (!access) {
    return Response.json({ error: "Validation introuvable." }, { status: 404 });
  }
  if (!canApprove(access.role)) return Response.json({ error: "Droits de validation insuffisants." }, { status: 403 });

  if (approval.status !== "pending") {
    return Response.json({ error: "Cette validation a déjà été traitée." }, { status: 409 });
  }

  await db
    .update(approvals)
    .set({ status: decision, decidedAt: new Date(), decidedByUserId: user.id })
    .where(eq(approvals.id, approvalId));

  let taskStatus: string | null = null;
  if (approval.actionType === "run_task" && approval.taskId) {
    taskStatus = decision === "approved" ? "draft" : "failed";
    await db
      .update(tasks)
      .set(
        decision === "approved"
          ? { status: "draft", updatedAt: new Date() }
          : { status: "failed", output: "Refusée par le client.", updatedAt: new Date() },
      )
      .where(eq(tasks.id, approval.taskId));
  }

  return Response.json({ ok: true, taskStatus });
}
