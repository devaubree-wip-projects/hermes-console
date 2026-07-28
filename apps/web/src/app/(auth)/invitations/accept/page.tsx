import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { tenantInvitations, tenants } from "@/db/schema";
import { AcceptInvitationCard } from "@/components/auth/accept-invitation-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { sha256Token } from "@/lib/token-hash";
import { TENANT_ROLE_LABELS } from "@/lib/tenant-rbac";

export const metadata: Metadata = {
  title: "Invitation",
};

function InvalidInvitation() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitation invalide</CardTitle>
        <CardDescription>
          Ce lien d&apos;invitation est invalide ou a expiré. Demandez à un Owner de
          l&apos;organisation de vous renvoyer une invitation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Aller à la connexion</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <InvalidInvitation />;

  const [row] = await db
    .select({ invitation: tenantInvitations, tenantName: tenants.name })
    .from(tenantInvitations)
    .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
    .where(
      and(
        eq(tenantInvitations.tokenHash, sha256Token(token)),
        gt(tenantInvitations.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  if (!row) return <InvalidInvitation />;

  const user = await getCurrentUser();
  const roleLabel = TENANT_ROLE_LABELS[row.invitation.role];
  const acceptPath = `/invitations/accept?token=${encodeURIComponent(token)}`;

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rejoindre {row.tenantName}</CardTitle>
          <CardDescription>
            Vous êtes invité·e à rejoindre l&apos;organisation « {row.tenantName} » avec le rôle{" "}
            {roleLabel}, via l&apos;adresse {row.invitation.email}. Connectez-vous ou créez un
            compte avec cette adresse pour accepter.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="h-11 w-full">
            <Link href={`/register?next=${encodeURIComponent(acceptPath)}`}>Créer un compte</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href={`/login?next=${encodeURIComponent(acceptPath)}`}>Se connecter</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (user.email.toLowerCase() !== row.invitation.email.toLowerCase()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rejoindre {row.tenantName}</CardTitle>
          <CardDescription>Cette invitation est destinée à une autre adresse email.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="warning">
            <AlertDescription>
              Vous êtes connecté·e en tant que {user.email}, mais l&apos;invitation a été envoyée à{" "}
              {row.invitation.email}. Déconnectez-vous puis reconnectez-vous avec le compte invité.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <AcceptInvitationCard
      token={token}
      tenantName={row.tenantName}
      roleLabel={roleLabel}
    />
  );
}
