import { describe, expect, test } from "bun:test";
import { dashboardSessionHref } from "./dashboard-links";

describe("dashboardSessionHref", () => {
  test("deep-links to the exact encoded session in the observed agent scope", () => {
    expect(dashboardSessionHref({
      tenantSlug: "acme",
      agentId: "agent/id + principal",
      session: { id: "session/id + été" },
    })).toBe(
      "/acme/d/chat/c/session%2Fid%20%2B%20%C3%A9t%C3%A9?agentId=agent%2Fid%20%2B%20principal",
    );
  });

  test("supports the legacy stable session_id field", () => {
    expect(dashboardSessionHref({
      tenantSlug: "acme",
      agentId: "agent-1",
      session: { session_id: "legacy-session" },
    })).toBe("/acme/d/chat/c/legacy-session?agentId=agent-1");
  });

  test("falls back to a generic chat that remains agent-scoped", () => {
    expect(dashboardSessionHref({
      tenantSlug: "acme",
      agentId: "agent-1",
      session: { id: " ", session_id: null },
    })).toBe("/acme/d/chat?agentId=agent-1");
  });
});
