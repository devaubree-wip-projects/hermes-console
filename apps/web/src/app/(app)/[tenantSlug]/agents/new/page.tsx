import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";
import { NewAgentForm } from "@/components/agents/new-agent-form";
import { PageHeading } from "@/components/product/page-heading";
import { Card, CardContent } from "@/components/ui/card";

export default async function NewAgentPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access || !canConfigureRuntime(access.role)) notFound();
  return <div className="min-h-full overflow-y-auto bg-background"><PageHeading eyebrow="Agents" title="Créer un agent" description="Définissez sa mission. Les modèles, skills et intégrations se règlent ensuite dans ses capacités." /><main className="mx-auto max-w-2xl px-5 py-8 md:px-8"><Card className="shadow-none"><CardContent><NewAgentForm endpoint={`/api/${tenantSlug}/agents`} /></CardContent></Card></main></div>;
}
