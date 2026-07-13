import { db } from "@/db";
import { chatSessions, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";

const MAX_CONTENT_LENGTH = 8000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: { workspaceId?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!workspaceId || !content || content.length > MAX_CONTENT_LENGTH) {
    return Response.json(
      { error: "Le message doit contenir entre 1 et 8000 caractères." },
      { status: 400 },
    );
  }

  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) {
    return Response.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  const [session] = await db
    .insert(chatSessions)
    .values({ workspaceId: workspace.id, title: content.slice(0, 60) })
    .returning();

  await db.insert(messages).values({ chatSessionId: session.id, role: "user", content });

  return Response.json({ sessionId: session.id });
}
