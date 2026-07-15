import { CapabilityPage } from "@/components/product/capability-page";

export default function SkillsPage({ params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  return <CapabilityPage params={params} title="Skills" description="Les savoir-faire installés pour le profil Hermes de l’agent principal." endpoint="/api/skills" empty="Aucun skill installé pour ce profil." showSkillDetails />;
}
