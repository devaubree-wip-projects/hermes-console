import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listWorkspacesForUser } from "@/lib/workspace";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/workspaces/new");
  redirect(`/w/${workspaces[0].id}`);
}
