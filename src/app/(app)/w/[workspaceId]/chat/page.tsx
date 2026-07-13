import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { NewChatForm } from "@/components/chat/new-chat-form";

export default async function ChatIndexPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const sessions = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      createdAt: chatSessions.createdAt,
      messageCount: count(messages.id),
    })
    .from(chatSessions)
    .leftJoin(messages, eq(messages.chatSessionId, chatSessions.id))
    .where(eq(chatSessions.workspaceId, workspace.id))
    .groupBy(chatSessions.id)
    .orderBy(desc(chatSessions.createdAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Chat</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {sessions.length === 0
          ? "Discutez avec votre assistant : posez une question ou décrivez une tâche."
          : "Reprenez une conversation ou démarrez-en une nouvelle."}
      </p>

      <div className="mt-6">
        <NewChatForm workspaceId={workspace.id} autoFocus={sessions.length === 0} />
      </div>

      {sessions.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Conversations récentes</h2>
          <ul className="divide-y overflow-hidden rounded-lg border">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/w/${workspace.id}/chat/${session.id}`}
                  className="flex min-h-11 items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(session.createdAt)}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {session.messageCount} message{session.messageCount > 1 ? "s" : ""}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
