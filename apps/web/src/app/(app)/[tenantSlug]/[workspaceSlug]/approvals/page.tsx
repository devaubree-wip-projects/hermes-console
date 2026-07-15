import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { approvals, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { canApprove, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { PageHeading } from "@/components/product/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ApprovalsPage({ params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const chatBase = `/${tenantSlug}/${workspaceSlug}/d/chat`;
  const rows = await db.select({ approval: approvals, task: tasks }).from(approvals).leftJoin(tasks, eq(approvals.taskId, tasks.id)).where(eq(approvals.workspaceId, access.workspace.id)).orderBy(desc(approvals.createdAt));
  const pending = rows.filter(({ approval }) => approval.status === "pending");
  return <div className="min-h-full overflow-y-auto bg-background"><PageHeading eyebrow="Contrôle" title="Validations" description="Les Members et Owners peuvent décider ; les Viewers disposent d’un historique en lecture seule." /><main className="mx-auto max-w-4xl space-y-6 px-5 py-6 md:px-8">
    {pending.length ? pending.map(({ approval, task }) => <Card key={approval.id} className="shadow-none"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">{task?.title ?? approval.actionType}</CardTitle><Badge variant="outline">En attente</Badge></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Demandée le {formatDateTime(approval.createdAt)}</p>{canApprove(access.role) ? <ApprovalActions approvalId={approval.id} taskId={null} chatBase={chatBase} /> : <p className="text-sm text-muted-foreground">Votre rôle est en lecture seule.</p>}</CardContent></Card>) : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Aucune action sensible en attente.</div>}
    {rows.some(({ approval }) => approval.status !== "pending") ? <section><h2 className="mb-3 text-base font-medium">Historique</h2><ul className="divide-y rounded-xl border">{rows.filter(({ approval }) => approval.status !== "pending").map(({ approval, task }) => <li key={approval.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="truncate text-sm">{task?.title ?? approval.actionType}</span><Badge variant={approval.status === "approved" ? "outline" : "destructive"}>{approval.status === "approved" ? "Approuvée" : "Refusée"}</Badge></li>)}</ul></section> : null}
  </main></div>;
}
