import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRingIcon, CircleIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { InboxActions } from "@/components/work/inbox-actions";
import { Button } from "@/components/ui/button";
import { listWorkspaceInbox } from "@/modules/work/infrastructure/work-service";
import { WorkLiveRefresh } from "@/components/work/work-live-refresh";

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(
    tenantSlug,
    workspaceSlug,
    user.id,
  );
  if (!access) notFound();
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = 50;
  const rows = await listWorkspaceInbox({
    workspaceId: access.workspace.id,
    userId: user.id,
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
  });
  const hasNextPage = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const unread = items.filter((item) => !item.readAt);
  const base = `/${tenantSlug}/${workspaceSlug}`;
  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <WorkLiveRefresh endpoint={`/api/${tenantSlug}/${workspaceSlug}/work-stream`} />
      <header className="border-b px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Travail
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Inbox
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Décisions, assignations et échecs qui demandent votre attention.
            </p>
          </div>
          <InboxActions
            endpoint={`/api/${tenantSlug}/${workspaceSlug}/inbox`}
            disabled={!unread.length}
          />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-5 py-6 md:px-8">
        {items.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((item) => {
              const href =
                item.sourceType === "work_intervention"
                  ? `${base}/approvals`
                  : item.sourceType === "work_item"
                    ? `${base}/tasks/${item.sourceId}`
                    : `${base}/tasks`;
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    className="flex gap-3 px-4 py-4 hover:bg-muted/40"
                  >
                    <span className="mt-1">
                      {item.readAt ? (
                        <CircleIcon className="size-3 text-muted-foreground" />
                      ) : (
                        <BellRingIcon className="size-4 text-amber-600" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {item.reason}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <h3 className="text-sm font-medium">Aucune action requise</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Les interventions et les runs à relire apparaîtront ici.
            </p>
          </div>
        )}
        {page > 1 || hasNextPage ? (
          <nav
            aria-label="Pagination de l’Inbox"
            className="flex items-center justify-between"
          >
            <Button
              asChild
              variant="outline"
              size="sm"
              className={page <= 1 ? "pointer-events-none invisible" : ""}
            >
              <Link
                href={
                  page <= 2 ? `${base}/inbox` : `${base}/inbox?page=${page - 1}`
                }
              >
                Page précédente
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={!hasNextPage ? "pointer-events-none invisible" : ""}
            >
              <Link href={`${base}/inbox?page=${page + 1}`}>Page suivante</Link>
            </Button>
          </nav>
        ) : null}
      </main>
    </div>
  );
}
