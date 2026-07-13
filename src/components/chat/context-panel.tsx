import Link from "next/link";
import { PERMISSION_KEYS, type WorkspacePermissions } from "@/lib/permissions";

export function ContextPanel({
  workspaceId,
  workspaceName,
  memoryCount,
  fileNames,
  permissions,
}: {
  workspaceId: string;
  workspaceName: string;
  memoryCount: number;
  fileNames: string[];
  permissions: WorkspacePermissions;
}) {
  const grantedCount = PERMISSION_KEYS.filter((key) => permissions[key]).length;
  const visibleFiles = fileNames.slice(0, 8);
  const extraFiles = fileNames.length - visibleFiles.length;

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 xl:block">
      <h2 className="text-sm font-semibold">Contexte utilisé</h2>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Workspace</dt>
          <dd className="mt-0.5 truncate">{workspaceName}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-muted-foreground">Connaissances</dt>
          <dd className="mt-0.5">
            {memoryCount} connaissance{memoryCount > 1 ? "s" : ""}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-muted-foreground">Fichiers</dt>
          {visibleFiles.length === 0 ? (
            <dd className="mt-0.5 text-muted-foreground">Aucun fichier déposé.</dd>
          ) : (
            <dd className="mt-1 space-y-1">
              {visibleFiles.map((name, i) => (
                <p key={`${i}-${name}`} className="truncate text-xs" title={name}>
                  {name}
                </p>
              ))}
              {extraFiles > 0 && <p className="text-xs text-muted-foreground">+{extraFiles}</p>}
            </dd>
          )}
        </div>

        <div>
          <dt className="text-xs font-medium text-muted-foreground">Permissions</dt>
          <dd className="mt-0.5">
            {grantedCount} / {PERMISSION_KEYS.length} accordées{" "}
            <Link
              href={`/w/${workspaceId}/settings`}
              className="text-primary underline-offset-4 hover:underline"
            >
              Gérer
            </Link>
          </dd>
        </div>
      </dl>
    </aside>
  );
}
