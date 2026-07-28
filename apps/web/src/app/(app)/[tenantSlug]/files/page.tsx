import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { files } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getTenantAccessBySlug } from "@/lib/workspace";
import { formatBytes, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteFileDialog } from "@/components/files/delete-file-dialog";
import { UploadZone } from "@/components/files/upload-zone";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();

  const items = await db
    .select()
    .from(files)
    .where(eq(files.workspaceId, access.workspace.id))
    .orderBy(desc(files.createdAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Fichiers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Les documents que votre assistant peut consulter.
      </p>

      <div className="mt-4">
        <UploadZone workspaceId={access.workspace.id} />
      </div>

      <div className="mt-6">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Déposez les documents (brief, PDF, exports…) que votre assistant pourra utiliser.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden md:table-cell">Taille</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="max-w-[9rem] sm:max-w-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{file.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">
                      {formatBytes(file.size)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatDate(file.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={`Télécharger ${file.name}`}
                        >
                          <a href={`/api/files/${file.id}`} target="_blank" rel="noopener noreferrer">
                            <Download className="size-4" />
                          </a>
                        </Button>
                        <DeleteFileDialog fileId={file.id} fileName={file.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
