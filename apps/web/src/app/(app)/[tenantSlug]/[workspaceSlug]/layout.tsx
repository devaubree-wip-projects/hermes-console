import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, runtimeInstallations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { AppShell } from "@/components/v1-xulux/app-shell";

export default async function ProductWorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>;
}>) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const workspaceBase = `/${tenantSlug}/${workspaceSlug}`;
  const workspaceAgents = await db
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
    .orderBy(asc(agents.createdAt));

  return (
    <div className="h-screen text-foreground antialiased">
      <AppShell
        agents={workspaceAgents}
        workspaceBase={workspaceBase}
        workspaceName={access.workspace.name}
        user={{ name: user.name, email: user.email }}
      >
        {children}
      </AppShell>
    </div>
  );
}
