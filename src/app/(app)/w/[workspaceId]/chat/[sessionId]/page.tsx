import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions, files, memoryItems, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normalizePermissions } from "@/lib/permissions";
import { getWorkspaceForUser } from "@/lib/workspace";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; sessionId: string }>;
}) {
  const { workspaceId, sessionId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.workspaceId, workspace.id)))
    .limit(1);
  if (!session) notFound();

  const [sessionMessages, memoryRows, fileRows] = await Promise.all([
    db.select().from(messages).where(eq(messages.chatSessionId, session.id)).orderBy(asc(messages.createdAt)),
    db.select().from(memoryItems).where(eq(memoryItems.workspaceId, workspace.id)),
    db.select().from(files).where(eq(files.workspaceId, workspace.id)),
  ]);

  const initialMessages = sessionMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2 md:px-6 lg:px-8">
        <Link
          href={`/w/${workspace.id}/chat`}
          className="inline-flex h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Conversations
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <ChatView
          workspaceId={workspace.id}
          sessionId={session.id}
          initialMessages={initialMessages}
          context={{
            workspaceName: workspace.name,
            memoryCount: memoryRows.length,
            fileNames: fileRows.map((f) => f.name),
            permissions: normalizePermissions(workspace.permissions),
          }}
        />
      </div>
    </div>
  );
}
