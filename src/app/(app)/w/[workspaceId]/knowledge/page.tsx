import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Info } from "lucide-react";
import { db } from "@/db";
import { memoryItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";
import { formatDate } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const items = await db
    .select()
    .from(memoryItems)
    .where(eq(memoryItems.workspaceId, workspaceId))
    .orderBy(desc(memoryItems.createdAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Connaissances</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ce que votre assistant retient de votre activité.
      </p>

      <Alert className="mt-4">
        <Info />
        <AlertDescription>
          Mémoire en lecture seule dans ce POC — l&apos;agent la consulte à chaque conversation ;
          l&apos;édition arrivera avec l&apos;intégration Hermes complète.
        </AlertDescription>
      </Alert>

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Votre assistant n&apos;a encore rien retenu sur ce workspace — les informations
            importantes s&apos;accumuleront ici au fil des conversations.
          </p>
        ) : (
          items.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-2">
                <p className="text-sm">{item.content}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{item.source === "seed" ? "Initial" : item.source}</Badge>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
