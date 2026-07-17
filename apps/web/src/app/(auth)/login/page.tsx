import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm, type DemoAccount } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { isSafeInternalPath } from "@/lib/console-url";
import { getConsoleDestinationForUser } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Connexion",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = isSafeInternalPath(next) ? next : null;
  const user = await getCurrentUser();
  if (user) redirect(safeNext ?? (await getConsoleDestinationForUser(user.id)));

  const demoAccounts: DemoAccount[] | null = process.env.NODE_ENV === "development"
    ? [
        {
          role: "Propriétaire",
          name: "Alice Owner",
          email: "owner@atelier-lumiere.local",
          password: "demo-password",
          description: "Administration complète",
        },
        {
          role: "Membre",
          name: "Marc Member",
          email: "member@atelier-lumiere.local",
          password: "demo-password",
          description: "Crée et exécute le travail",
        },
        {
          role: "Observatrice",
          name: "Violette Viewer",
          email: "viewer@atelier-lumiere.local",
          password: "demo-password",
          description: "Consultation seule",
        },
      ]
    : null;

  return <LoginForm demoAccounts={demoAccounts} next={safeNext} />;
}
