"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AcceptInvitationCard({
  token,
  tenantName,
  roleLabel,
}: {
  token: string;
  tenantName: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue. Réessayez.");
        return;
      }
      router.push(typeof data.redirectTo === "string" ? data.redirectTo : "/");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rejoindre {tenantName}</CardTitle>
        <CardDescription>
          Vous êtes invité·e à rejoindre l&apos;organisation « {tenantName} » avec le rôle{" "}
          {roleLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button onClick={accept} disabled={pending} className="h-11 w-full">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Accepter l&apos;invitation
        </Button>
      </CardContent>
    </Card>
  );
}
