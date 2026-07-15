import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { requireUser } from "@/lib/auth";
import { getWorkspaceLocationForUser, listWorkspacesForUser } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Configurer votre espace",
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);

  if (workspaces.length > 0) {
    const location = await getWorkspaceLocationForUser(workspaces[0].id, user.id);
    if (location) redirect(`/${location.tenant.slug}/${location.workspace.slug}/dashboard`);
  }

  return <OnboardingFlow userName={user.name} />;
}
