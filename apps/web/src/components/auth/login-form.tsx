"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FlaskConical, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DemoAccount = {
  role: string;
  name: string;
  email: string;
  password: string;
  description: string;
};

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] | null }) {
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

  function selectDemoAccount(account: DemoAccount) {
    setError(null);
    setEmail(account.email);
    setPassword(account.password);
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
          {demoAccounts ? (
            <div className="mt-5 border-t pt-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FlaskConical className="size-4 text-muted-foreground" aria-hidden="true" />
                Comptes de démonstration
              </div>
              <div
                className="mt-3 overflow-hidden rounded-md border"
                role="group"
                aria-label="Comptes de démonstration"
              >
                {demoAccounts.map((account, index) => {
                  const isSelected = email === account.email && password === account.password;

                  return (
                    <button
                      key={account.email}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={pending}
                      onClick={() => selectDemoAccount(account)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 ${
                        index > 0 ? "border-t" : ""
                      } ${isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{account.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{account.role}</span>
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {account.email}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {account.description}
                        </span>
                      </span>
                      <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                        {isSelected ? <Check className="size-4 text-primary" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Sélectionnez un rôle, puis connectez-vous.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
