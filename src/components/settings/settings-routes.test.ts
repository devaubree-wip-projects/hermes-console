import { describe, expect, test } from "bun:test"
import {
  SETTINGS_PANELS,
  resolveSettingsPanel,
  settingsPanelHref,
} from "@/components/settings/settings-routes"

describe("settings routes", () => {
  test("resolves every declared panel", () => {
    for (const panel of SETTINGS_PANELS) {
      expect(resolveSettingsPanel([panel.id])).toBe(panel.id)
    }
  })

  test("rejects missing, unknown, and nested panels", () => {
    expect(resolveSettingsPanel(undefined)).toBeNull()
    expect(resolveSettingsPanel(["billing"])).toBeNull()
    expect(resolveSettingsPanel(["chat", "advanced"])).toBeNull()
  })

  test("builds workspace-scoped panel links", () => {
    expect(settingsPanelHref("/acme/ops", "members")).toBe("/acme/ops/settings/members")
  })
})
