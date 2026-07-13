import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions, messages, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { TASK_TEMPLATES } from "@/lib/task-templates";
import { getWorkspaceForUser } from "@/lib/workspace";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) {
    return Response.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  const workspace = await getWorkspaceForUser(task.workspaceId, user.id);
  if (!workspace) {
    return Response.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  if (task.status !== "draft") {
    return Response.json(
      { error: "Cette tâche ne peut pas être exécutée dans son état actuel." },
      { status: 409 },
    );
  }

  const template = TASK_TEMPLATES[task.kind];

  const [session] = await db
    .insert(chatSessions)
    .values({ workspaceId: task.workspaceId, title: task.title, taskId: task.id })
    .returning();

  await db.insert(messages).values({
    chatSessionId: session.id,
    role: "user",
    content: template.buildPrompt(task.input),
  });

  await db
    .update(tasks)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(tasks.id, task.id));

  return Response.json({ sessionId: session.id });
}
