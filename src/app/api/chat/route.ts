import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions, files, memoryItems, messages, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { buildSystemPrompt, parseSseDelta, streamHermesChat, type ChatMessage } from "@/lib/hermes";
import { normalizePermissions } from "@/lib/permissions";
import { getWorkspaceForUser } from "@/lib/workspace";

const MAX_CONTENT_LENGTH = 8000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: { sessionId?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return Response.json({ error: "Conversation invalide." }, { status: 400 });
  }

  let content: string | undefined;
  if (body.content !== undefined && body.content !== null) {
    if (typeof body.content !== "string") {
      return Response.json({ error: "Message invalide." }, { status: 400 });
    }
    const trimmed = body.content.trim();
    if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
      return Response.json(
        { error: "Le message doit contenir entre 1 et 8000 caractères." },
        { status: 400 },
      );
    }
    content = trimmed;
  }

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);
  if (!session) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  const workspace = await getWorkspaceForUser(session.workspaceId, user.id);
  if (!workspace) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  if (content) {
    await db.insert(messages).values({ chatSessionId: session.id, role: "user", content });
  } else {
    const [lastMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.chatSessionId, session.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (!lastMessage || lastMessage.role !== "user") {
      return Response.json({ error: "Rien à relancer." }, { status: 400 });
    }
  }

  const [memoryRows, fileRows, sessionMessages] = await Promise.all([
    db.select().from(memoryItems).where(eq(memoryItems.workspaceId, workspace.id)).orderBy(asc(memoryItems.createdAt)),
    db.select().from(files).where(eq(files.workspaceId, workspace.id)).orderBy(asc(files.createdAt)),
    db.select().from(messages).where(eq(messages.chatSessionId, session.id)).orderBy(asc(messages.createdAt)),
  ]);

  const systemPrompt = buildSystemPrompt({
    workspaceName: workspace.name,
    permissions: normalizePermissions(workspace.permissions),
    memoryItems: memoryRows.map((m) => m.content),
    fileNames: fileRows.map((f) => f.name),
  });

  const upstreamMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...sessionMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  let upstream: Response;
  try {
    upstream = await streamHermesChat({
      baseUrl: workspace.hermesBaseUrl,
      apiKey: workspace.hermesApiKey,
      messages: upstreamMessages,
    });
  } catch {
    if (session.taskId) {
      await db
        .update(tasks)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(tasks.id, session.taskId));
    }
    return Response.json(
      { error: "Le gateway Hermes est injoignable. Vérifiez la connexion dans les réglages." },
      { status: 502 },
    );
  }

  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let persisted = false;

  async function persist() {
    if (persisted) return;
    persisted = true;
    await db.insert(messages).values({ chatSessionId: session.id, role: "assistant", content: accumulated });
    if (session.taskId) {
      await db
        .update(tasks)
        .set({ status: "done", output: accumulated, updatedAt: new Date() })
        .where(eq(tasks.id, session.taskId));
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const delta = parseSseDelta(line);
            if (delta) accumulated += delta;
          }
          try {
            controller.enqueue(value);
          } catch {
            // Client disconnected: stop forwarding, still finish accumulating below.
            break;
          }
        }
      } catch {
        // Upstream read error: fall through and persist whatever was accumulated.
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed or errored.
        }
        await persist();
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {
        // Ignore: upstream reader already done.
      }
      await persist();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
