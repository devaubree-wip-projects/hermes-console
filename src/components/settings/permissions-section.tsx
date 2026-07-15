"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey, type WorkspacePermissions } from "@/lib/permissions";

/**
 * The only app permission that maps cleanly onto a real Hermes toolset. The
 * others (read/edit files, reports, emails, PRs) have no safe 1:1 equivalent —
 * file/shell access is governed by the working directory + approval mode in the
 * Runtime panel, not by per-action toggles here. See the Runtime panel.
 */
const TOOLSET_FOR_PERMISSION: Partial<Record<PermissionKey, string>> = {
  web_search: "web",
};

export function PermissionsSection({
  workspaceId,
  permissions,
  profile,
  toolsetApiBase,
  runtimeHref,
}: {
  workspaceId: string;
  permissions: WorkspacePermissions;
  profile: string | null;
  toolsetApiBase: string;
  runtimeHref: string;
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

      // Mirror the toggle onto the real Hermes toolset when one exists. Best
      // effort: a runtime hiccup must not roll back the saved console gate, so
      // we warn instead of reverting.
      const toolset = TOOLSET_FOR_PERMISSION[key];
      if (toolset && profile) {
        const runtimeRes = await fetch(`${toolsetApiBase}/${encodeURIComponent(toolset)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: checked, profile }),
        }).catch(() => null);
        if (!runtimeRes || !runtimeRes.ok) {
          toast.warning("Enregistré côté console, mais le toolset Hermes n'a pas pu être synchronisé.");
          router.refresh();
          return;
        }
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
    <div className="space-y-6">
      <Alert variant="info" title="Ce que ces réglages font (et ne font pas)">
        Ces bascules pilotent les <strong>validations demandées côté console</strong> (ex. avant de lancer une
        tâche sensible). Elles ne brident pas le système de fichiers ni le shell de l’agent : l’accès machine réel
        se règle via le répertoire de travail et le mode d’approbation dans{" "}
        <Link href={runtimeHref} className="underline underline-offset-2">Runtime</Link>. « Chercher sur le web »
        est l’exception : elle active/désactive réellement le toolset Hermes correspondant.
      </Alert>
      <SettingsSection title="Garde-fous côté console">
        {PERMISSION_KEYS.map((key) => {
          const meta = PERMISSION_LABELS[key];
          const wired = Boolean(TOOLSET_FOR_PERMISSION[key]);
          return (
            <SettingsRow
              key={key}
              label={(
                <span className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`permission-${key}`}>{meta.label}</Label>
                  {wired ? (
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-400">
                      Appliqué au runtime
                    </Badge>
                  ) : meta.sensitive ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
                    >
                      Validation requise
                    </Badge>
                  ) : null}
                </span>
              )}
              description={(
                <>
                  {meta.description}
                  {meta.sensitive ? " Chaque action nécessitera votre validation." : ""}
                </>
              )}
              control={(
                <Switch
                  id={`permission-${key}`}
                  checked={state[key]}
                  disabled={pendingKey === key}
                  onCheckedChange={(checked) => toggle(key, checked)}
                  aria-label={meta.label}
                />
              )}
            />
          );
        })}
      </SettingsSection>
    </div>
  );
}
