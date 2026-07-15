import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { getConsoleDestinationForUser } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Connexion",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(await getConsoleDestinationForUser(user.id));

  const devCredentials = process.env.NODE_ENV === "development"
    ? {
        email: process.env.HERMES_DEV_LOGIN_EMAIL ?? "demo@hermes.local",
        password: process.env.HERMES_DEV_LOGIN_PASSWORD ?? "demo-password",
      }
    : null;

  return <LoginForm devCredentials={devCredentials} />;
}
