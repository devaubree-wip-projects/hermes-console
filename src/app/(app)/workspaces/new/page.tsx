import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listWorkspacesForUser } from "@/lib/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewWorkspaceForm } from "@/components/workspaces/new-workspace-form";

export default async function NewWorkspacePage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Retour
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Nouveau workspace</CardTitle>
            <CardDescription>
              Créez un espace dédié pour piloter votre assistant sur un nouveau périmètre.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewWorkspaceForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
