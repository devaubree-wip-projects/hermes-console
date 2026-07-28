import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, runtimeInstallations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getTenantAccessBySlug } from "@/lib/workspace";
import { countWorkspaceInboxUnread } from "@/modules/work/infrastructure/work-service";
import { AppShell } from "@/components/v1-xulux/app-shell";

export default async function ProductWorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}>) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const workspaceBase = `/${tenantSlug}`;
  const [workspaceAgents, inboxUnreadCount] = await Promise.all([
    db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        runtimeState: agents.runtimeState,
        installationName: runtimeInstallations.name,
        installationStatus: runtimeInstallations.status,
        hermesVersion: runtimeInstallations.hermesVersion,
      })
      .from(agents)
      .leftJoin(
        runtimeInstallations,
        eq(runtimeInstallations.id, agents.runtimeInstallationId),
      )
      .where(eq(agents.workspaceId, access.workspace.id))
      .orderBy(asc(agents.createdAt)),
    countWorkspaceInboxUnread({
      workspaceId: access.workspace.id,
      userId: user.id,
    }),
  ]);

  return (
    <div className="h-dvh text-foreground antialiased">
      <AppShell
        agents={workspaceAgents}
        workspaceBase={workspaceBase}
        organizationName={access.tenant.name}
        user={{ name: user.name, email: user.email }}
        inboxUnreadCount={inboxUnreadCount}
      >
        {children}
      </AppShell>
    </div>
  );
}
