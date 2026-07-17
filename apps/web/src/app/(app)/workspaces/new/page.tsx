import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConsoleDestinationForUser } from "@/lib/workspace";

export default async function RetiredWorkspacePage() {
  const user = await requireUser();
  redirect(await getConsoleDestinationForUser(user.id));
}
