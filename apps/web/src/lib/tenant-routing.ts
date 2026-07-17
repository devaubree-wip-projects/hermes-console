const PRODUCT_SEGMENTS = new Set([
  "agents",
  "approvals",
  "automations",
  "d",
  "dashboard",
  "events",
  "files",
  "inbox",
  "installations",
  "integrations",
  "knowledge",
  "models",
  "projects",
  "settings",
  "skills",
  "tasks",
  "team",
  "tools",
]);

export function legacyTenantRedirectPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const tenantSlug = segments[0];
  const possibleWorkspaceSegment = segments[1];
  const productSegment = segments[2];
  const rest = segments.slice(3);
  if (
    !tenantSlug ||
    tenantSlug === "api" ||
    !possibleWorkspaceSegment ||
    PRODUCT_SEGMENTS.has(possibleWorkspaceSegment) ||
    !productSegment ||
    !PRODUCT_SEGMENTS.has(productSegment)
  ) {
    return null;
  }
  return ["", tenantSlug, productSegment, ...rest].join("/");
}
