import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkspaceForUser, listWorkspacesForUser } from "@/lib/workspace";
import { AppShell } from "@/components/shell/app-shell";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const [allWorkspaces, [pending]] = await Promise.all([
    listWorkspacesForUser(user.id),
    db
      .select({ value: count() })
      .from(approvals)
      .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending"))),
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspace={{ id: workspace.id, name: workspace.name }}
      workspaces={allWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
      pendingApprovals={pending?.value ?? 0}
    >
      {children}
    </AppShell>
  );
}
