import type { MembershipRole } from "@/db/schema";

export const TENANT_ROLES: MembershipRole[] = ["owner", "member", "viewer"];

export const TENANT_ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  member: "Member",
  viewer: "Viewer",
};

export const TENANT_CAPABILITIES = [
  { key: "read", label: "Consulter les agents, tâches, fichiers et événements" },
  { key: "work", label: "Créer et modifier le travail" },
  { key: "approve", label: "Répondre aux validations et interventions" },
  { key: "runtime", label: "Configurer les agents et le runtime Hermes" },
  { key: "members", label: "Gérer les membres et leurs rôles" },
] as const;

export type TenantCapability = (typeof TENANT_CAPABILITIES)[number]["key"];

const ROLE_CAPABILITIES: Record<MembershipRole, ReadonlySet<TenantCapability>> = {
  owner: new Set(["read", "work", "approve", "runtime", "members"]),
  member: new Set(["read", "work", "approve"]),
  viewer: new Set(["read"]),
};

export function tenantRoleCan(role: MembershipRole, capability: TenantCapability) {
  return ROLE_CAPABILITIES[role].has(capability);
}
