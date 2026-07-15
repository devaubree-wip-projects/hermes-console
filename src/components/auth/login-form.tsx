"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DevCredentials = { email: string; password: string };

export function LoginForm({ devCredentials }: { devCredentials: DevCredentials | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function login(loginEmail: string, loginPassword: string) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue. Réessayez.");
        return;
      }
      router.push(
        typeof data.redirectTo === "string" ? data.redirectTo : "/onboarding",
      );
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login(email, password);
  }

  async function handleDevelopmentLogin() {
    if (!devCredentials) return;
    setEmail(devCredentials.email);
    setPassword(devCredentials.password);
    await login(devCredentials.email, devCredentials.password);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Accédez à votre espace client Hermes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} className="h-11 w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              Se connecter
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Créer un compte
            </Link>
          </p>
          {devCredentials ? (
            <div className="mt-5 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                disabled={pending}
                onClick={handleDevelopmentLogin}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical />}
                Remplir et se connecter en mode dev
              </Button>
              <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
                {devCredentials.email}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
