type DashboardSession = {
  id?: string | null;
  session_id?: string | null;
};

function stableSessionId(session: DashboardSession): string | null {
  const id = typeof session.id === "string" ? session.id.trim() : "";
  if (id) return id;

  const legacyId = typeof session.session_id === "string"
    ? session.session_id.trim()
    : "";
  return legacyId || null;
}

export function dashboardSessionHref({
  tenantSlug,
  agentId,
  session,
}: {
  tenantSlug: string;
  agentId: string;
  session: DashboardSession;
}): string {
  const chatBase = `/${encodeURIComponent(tenantSlug)}/d/chat`;
  const agentQuery = `agentId=${encodeURIComponent(agentId)}`;
  const sessionId = stableSessionId(session);

  return sessionId
    ? `${chatBase}/c/${encodeURIComponent(sessionId)}?${agentQuery}`
    : `${chatBase}?${agentQuery}`;
}
