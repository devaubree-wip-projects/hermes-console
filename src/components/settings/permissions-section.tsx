"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey, type WorkspacePermissions } from "@/lib/permissions";

export function PermissionsSection({
  workspaceId,
  permissions,
}: {
  workspaceId: string;
  permissions: WorkspacePermissions;
}) {
  const router = useRouter();
  const [state, setState] = useState(permissions);
  const [pendingKey, setPendingKey] = useState<PermissionKey | null>(null);

  async function toggle(key: PermissionKey, checked: boolean) {
    const previous = state;
    const next = { ...state, [key]: checked };
    setState(next);
    setPendingKey(key);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Échec de la mise à jour.");
      }
      toast.success("Enregistré");
      router.refresh();
    } catch (err) {
      setState(previous);
      toast.error(err instanceof Error ? err.message : "Échec de la mise à jour.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions de l&apos;agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {PERMISSION_KEYS.map((key) => {
          const meta = PERMISSION_LABELS[key];
          return (
            <div key={key} className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`permission-${key}`}>{meta.label}</Label>
                  {meta.sensitive && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
                    >
                      Validation requise
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {meta.description}
                  {meta.sensitive ? " Chaque action nécessitera votre validation." : ""}
                </p>
              </div>
              <Switch
                id={`permission-${key}`}
                checked={state[key]}
                disabled={pendingKey === key}
                onCheckedChange={(checked) => toggle(key, checked)}
                className="mt-1"
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
