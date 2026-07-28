export function toSlug(value: string, fallback = "workspace"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return slug || fallback;
}

export function hermesProfileName(tenantSlug: string, workspaceSlug: string, agentSlug: string) {
  return [tenantSlug, workspaceSlug, agentSlug]
    .join("-")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}
