import { db } from "@/db";
import { approvals, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { normalizePermissions } from "@/lib/permissions";
import { TASK_KINDS, TASK_TEMPLATES, type TaskKind } from "@/lib/task-templates";
import { getWorkspaceForUser } from "@/lib/workspace";

function isTaskKind(value: string): value is TaskKind {
  return (TASK_KINDS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
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

  const { workspaceId, kind, input } = (body ?? {}) as {
    workspaceId?: unknown;
    kind?: unknown;
    input?: unknown;
  };

  if (typeof workspaceId !== "string" || !workspaceId) {
    return Response.json({ error: "Workspace invalide." }, { status: 400 });
  }

  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) {
    return Response.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  if (typeof kind !== "string" || !isTaskKind(kind)) {
    return Response.json({ error: "Type de tâche inconnu." }, { status: 400 });
  }

  const trimmedInput = typeof input === "string" ? input.trim() : "";
  if (!trimmedInput || trimmedInput.length > 4000) {
    return Response.json(
      { error: "Décrivez la tâche (4000 caractères max)." },
      { status: 400 },
    );
  }

  const template = TASK_TEMPLATES[kind];
  const title = `${template.label} — ${trimmedInput.slice(0, 60)}`;
  const permissions = normalizePermissions(workspace.permissions);
  const needsApproval = Boolean(template.permission) && !permissions[template.permission!];

  const [task] = await db
    .insert(tasks)
    .values({
      workspaceId,
      title,
      kind: template.kind,
      status: needsApproval ? "waiting_approval" : "draft",
      input: trimmedInput,
    })
    .returning();

  if (needsApproval) {
    await db.insert(approvals).values({
      workspaceId,
      taskId: task.id,
      actionType: "run_task",
      payload: { kind: template.kind, permission: template.permission },
      status: "pending",
    });
  }

  return Response.json({ taskId: task.id, status: task.status });
}
