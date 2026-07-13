import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";
import { normalizePermissions } from "@/lib/permissions";
import { GeneralSection } from "@/components/settings/general-section";
import { ConnectionSection } from "@/components/settings/connection-section";
import { PermissionsSection } from "@/components/settings/permissions-section";
import { DangerZone } from "@/components/settings/danger-zone";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const permissions = normalizePermissions(workspace.permissions);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Réglages</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gérez les informations, la connexion à l&apos;agent et les permissions de ce workspace.
      </p>

      <div className="mt-6 space-y-6">
        <GeneralSection workspaceId={workspace.id} name={workspace.name} />
        <ConnectionSection
          workspaceId={workspace.id}
          hermesBaseUrl={workspace.hermesBaseUrl}
          hasApiKey={Boolean(workspace.hermesApiKey)}
        />
        <PermissionsSection workspaceId={workspace.id} permissions={permissions} />
        <DangerZone workspaceId={workspace.id} workspaceName={workspace.name} />
      </div>
    </div>
  );
}
