import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hermesFetch } from "@/lib/hermes/server";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { PageHeading } from "@/components/product/page-heading";
import { CapabilityGrid, type CapabilityItem } from "@/components/product/capability-grid";

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const array = Object.values(object).find(Array.isArray);
    if (Array.isArray(array)) return records(array);
    return Object.entries(object)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .slice(0, 30)
      .map(([name, entry]) => ({
        name,
        description:
          typeof entry === "object"
            ? JSON.stringify(entry).slice(0, 220)
            : String(entry),
      }));
  }
  return [];
}

export async function CapabilityPage({
  params,
  title,
  description,
  endpoint,
  empty,
  showSkillDetails = false,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>;
  title: string;
  description: string;
  endpoint: string;
  empty: string;
  showSkillDetails?: boolean;
}) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const [agent] = await db.select().from(agents).where(eq(agents.workspaceId, access.workspace.id)).orderBy(asc(agents.createdAt)).limit(1);
  const separator = endpoint.includes("?") ? "&" : "?";
  const result = agent
    ? await hermesFetch<unknown>(`${endpoint}${separator}profile=${encodeURIComponent(agent.hermesProfileName)}`).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error: error instanceof Error ? error.message : "Runtime indisponible" }))
    : { data: null, error: "Créez d’abord un agent." };
  const items = records(result.data);
  const capabilities: CapabilityItem[] = items.map((item, index) => ({
    name: String(item.name ?? item.title ?? item.id ?? `Élément ${index + 1}`),
    description: String(item.description ?? item.summary ?? item.status ?? "Configuré dans le profil Hermes."),
    enabled: item.enabled !== false && item.disabled !== true,
  }));

  return <div className="h-full overflow-y-auto bg-background">
    <PageHeading eyebrow="Capacités Hermes" title={title} description={description} />
    <main className="w-full px-5 py-6 md:px-8">
      {result.error ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm"><p className="font-medium">Données indisponibles</p><p className="mt-1 text-muted-foreground">{result.error}</p></div> : capabilities.length ? <CapabilityGrid items={capabilities} detailEndpoint={showSkillDetails ? `/api/${tenantSlug}/${workspaceSlug}/skills/content` : undefined} /> : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{empty}</div>}
    </main>
  </div>;
}
