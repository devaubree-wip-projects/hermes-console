"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { TENANT_ROLES, TENANT_ROLE_LABELS } from "@/lib/tenant-rbac";
import type { MembershipRole } from "@/db/schema";

export type MemberItem = {
  id: string;
  name: string;
  email: string;
  role: MembershipRole;
};

export type InvitationItem = {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAtLabel: string;
};

export function MembersSection({
  tenantSlug,
  currentUserId,
  founderUserId,
  members,
  invitations,
}: {
  tenantSlug: string;
  currentUserId: string;
  founderUserId: string;
  members: MemberItem[];
  invitations: InvitationItem[];
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function callApi(path: string, init: RequestInit): Promise<boolean> {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Une erreur est survenue. Réessayez.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await callApi(`/api/${tenantSlug}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (ok) {
      setNotice(`Invitation envoyée à ${inviteEmail.trim()}.`);
      setInviteEmail("");
    }
  }

  return (
    <div className="space-y-8">
      {(error || notice) && (
        <Alert variant={error ? "destructive" : "info"}>
          <AlertDescription>{error ?? notice}</AlertDescription>
        </Alert>
      )}

      <SettingsSection title="Inviter un membre">
        <form
          onSubmit={invite}
          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="collegue@entreprise.fr"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Rôle</Label>
            <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as MembershipRole)}>
              <SelectTrigger id="invite-role" className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENANT_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {TENANT_ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending} className="h-11 sm:h-9">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Inviter
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection title="Équipe">
        {members.map((member) => {
          const isFounder = member.id === founderUserId;
          return (
            <SettingsRow
              key={member.id}
              align="center"
              label={`${member.name}${member.id === currentUserId ? " (vous)" : ""}`}
              description={member.email}
              control={
                isFounder ? (
                  <Badge variant="outline">{TENANT_ROLE_LABELS.owner} (fondateur)</Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      disabled={pending}
                      onValueChange={(value) =>
                        callApi(`/api/${tenantSlug}/members/${member.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ role: value }),
                        })
                      }
                    >
                      <SelectTrigger className="w-32" aria-label={`Rôle de ${member.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TENANT_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {TENANT_ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`Retirer ${member.name} de l'organisation`}
                      onClick={() => {
                        if (window.confirm(`Retirer ${member.name} de l'organisation ?`)) {
                          void callApi(`/api/${tenantSlug}/members/${member.id}`, {
                            method: "DELETE",
                          });
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                )
              }
            />
          );
        })}
      </SettingsSection>

      {invitations.length > 0 ? (
        <SettingsSection title="Invitations en attente">
          {invitations.map((invitation) => (
            <SettingsRow
              key={invitation.id}
              align="center"
              label={invitation.email}
              description={`${TENANT_ROLE_LABELS[invitation.role]} · expire le ${invitation.expiresAtLabel}`}
              control={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    callApi(`/api/${tenantSlug}/invitations/${invitation.id}`, { method: "DELETE" })
                  }
                >
                  Révoquer
                </Button>
              }
            />
          ))}
        </SettingsSection>
      ) : null}
    </div>
  );
}
