import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm, type DemoAccount } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { isSafeInternalPath } from "@/lib/console-url";
import { settingValue } from "@/lib/settings/resolve";
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

  // En développement le panneau est toujours là. Sur un déploiement de test, il
  // s'ouvre par HERMES_DEMO_ACCOUNTS=true : ces comptes ont un mot de passe
  // public et l'un d'eux est propriétaire, donc jamais sur une instance servant
  // de vrais utilisateurs. L'install force la valeur à false sans --demo-accounts.
  const demoAccountsEnabled = process.env.NODE_ENV === "development"
    || (await settingValue("HERMES_DEMO_ACCOUNTS")) === "true";
  const demoAccounts: DemoAccount[] | null = demoAccountsEnabled
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
          description: "Rejoint l'organisation sur invitation",
        },
      ]
    : null;

  return <LoginForm demoAccounts={demoAccounts} next={safeNext} />;
}
