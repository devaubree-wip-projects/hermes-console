import { and, desc, eq } from "drizzle-orm";
import { ActivityIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { EventLogsDataTable } from "@/components/events/event-logs-data-table";
import { PageHeading } from "@/components/product/page-heading";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { publicEventMetadata } from "@/lib/events/presentation";
import { getTenantAccessBySlug } from "@/lib/workspace";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(and(
      eq(auditEvents.tenantId, access.tenant.id),
      eq(auditEvents.workspaceId, access.workspace.id),
    ))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);

  return (
    <div className="h-full overflow-y-auto bg-background" data-testid="event-logs-content">
      <PageHeading
        eyebrow="Observabilité"
        title="Event Logs"
        description="Les actions récentes de l’organisation, les changements Hermes et les échecs de connexion — sans identifiants sensibles ni secrets."
      />
      <main className="w-full px-5 pb-8 md:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-semibold">Activité récente</h1>
            <p className="mt-1 text-sm text-muted-foreground">Les 100 derniers événements enregistrés.</p>
          </div>
          <Badge variant="secondary"><ActivityIcon />{rows.length} événement{rows.length > 1 ? "s" : ""}</Badge>
        </div>

        <EventLogsDataTable events={rows.map((row) => ({
          ...row,
          metadata: publicEventMetadata(row.metadata),
          createdAt: row.createdAt.toISOString(),
        }))} />
      </main>
    </div>
  );
}
