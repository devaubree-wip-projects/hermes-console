import { Landing } from "@/components/landing/landing";
import { getCurrentUser } from "@/lib/auth";
import { getConsoleDestinationForUser } from "@/lib/workspace";

export default async function Home() {
  const user = await getCurrentUser();
  const consoleHref = user
    ? await getConsoleDestinationForUser(user.id)
    : "/login";

  return <Landing consoleHref={consoleHref} isAuthenticated={Boolean(user)} />;
}
