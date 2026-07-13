import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Créer un compte",
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return <RegisterForm />;
}
