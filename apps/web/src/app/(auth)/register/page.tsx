import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/lib/auth";
import { isSafeInternalPath } from "@/lib/console-url";

export const metadata: Metadata = {
  title: "Créer un compte",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = isSafeInternalPath(next) ? next : null;
  const user = await getCurrentUser();
  if (user) redirect(safeNext ?? "/");

  return <RegisterForm next={safeNext} />;
}
