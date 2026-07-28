import { describe, expect, test } from "bun:test"
import {
  PRODUCT_NAVIGATION,
  getPrimaryProductNavigation,
  getSearchableProductNavigation,
  isProductRouteActive,
  productRouteHref,
  resolveProductRouteTitle,
  withAgentContext,
} from "./product-navigation"

describe("product navigation", () => {
  test("builds tenant-scoped hrefs for primary and settings routes", () => {
    expect(productRouteHref("/acme", "dashboard")).toBe("/acme/dashboard")
    expect(productRouteHref("/acme/", "sessions")).toBe("/acme/d/chat")
    expect(productRouteHref("/acme", "settings-connectors")).toBe(
      "/acme/settings/mcp",
    )

    expect(
      getPrimaryProductNavigation("/acme", "work").map((route) => route.id),
    ).toEqual(["inbox", "tasks", "projects", "automations", "approvals"])
    expect(
      getPrimaryProductNavigation("/acme", "main").map((route) => route.id),
    ).toEqual(["dashboard", "sessions"])
  })

  test("exposes every searchable route with metadata and a workspace href", () => {
    const searchable = getSearchableProductNavigation("/acme")

    expect(searchable.length).toBeGreaterThan(0)
    expect(searchable).toHaveLength(
      PRODUCT_NAVIGATION.filter((route) => route.searchable).length,
    )
    expect(searchable.find((route) => route.id === "skills")?.href).toBe(
      "/acme/skills",
    )
    expect(
      searchable.find((route) => route.id === "event-logs")?.keywords,
    ).toContain("audit")
    for (const routeId of [
      "skills",
      "settings-connectors",
      "integrations",
      "installations",
      "knowledge",
      "settings-tools",
      "event-logs",
    ] as const) {
      expect(searchable.some((route) => route.id === routeId)).toBe(true)
    }
    expect(searchable.every((route) => route.href.startsWith("/acme/"))).toBe(
      true,
    )
    expect(searchable.some((route) => route.id === "agent-new")).toBe(false)
  })

  test("keeps deep routes and settings panels active in the canonical section", () => {
    expect(
      isProductRouteActive("/acme/d/chat/c/session-1", "/acme", "sessions"),
    ).toBe(true)
    expect(
      isProductRouteActive("/acme/tasks/task-1", "/acme", "tasks"),
    ).toBe(true)
    expect(
      isProductRouteActive("/acme/settings/mcp", "/acme", "settings-chat"),
    ).toBe(true)
    expect(
      isProductRouteActive("/other/tasks/task-1", "/acme", "tasks"),
    ).toBe(false)
  })

  test("preserves a non-default agent across product navigation", () => {
    expect(withAgentContext("/acme/dashboard", "agent/2", "agent-1")).toBe(
      "/acme/dashboard?agentId=agent%2F2",
    )
    expect(withAgentContext("/acme/dashboard", "agent-1", "agent-1")).toBe(
      "/acme/dashboard",
    )
    expect(withAgentContext("/acme/dashboard")).toBe("/acme/dashboard")
  })

  test("resolves dashboard, chat, details, settings, and fallback titles", () => {
    expect(resolveProductRouteTitle("/acme/dashboard", "/acme")).toBe(
      "Dashboard",
    )
    expect(resolveProductRouteTitle("/acme/d/chat/session-42", "/acme")).toBe(
      "Sessions",
    )
    expect(resolveProductRouteTitle("/acme/tasks/task-42", "/acme")).toBe(
      "Détail de la tâche",
    )
    expect(resolveProductRouteTitle("/acme/projects/project-42", "/acme")).toBe(
      "Détail du projet",
    )
    expect(resolveProductRouteTitle("/acme/settings/mcp", "/acme")).toBe(
      "Connecteurs",
    )
    expect(resolveProductRouteTitle("/acme/settings/unknown", "/acme")).toBe(
      "Paramètres",
    )
    expect(resolveProductRouteTitle("/acme/unknown", "/acme")).toBe(
      "Hermes Console",
    )
    expect(resolveProductRouteTitle("/other/dashboard", "/acme")).toBe(
      "Hermes Console",
    )
  })
})
