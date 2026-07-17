import { describe, expect, test } from "bun:test";
import { interventionEmail } from "./intervention-notification";

describe("interventionEmail", () => {
  test("builds a subject and body with the tenant, type label and console URL", () => {
    const mail = interventionEmail({
      tenantName: "Atelier Lumière",
      type: "approval",
      url: "https://console.test/atelier/approvals",
    });
    expect(mail.subject).toContain("Atelier Lumière");
    expect(mail.subject).toContain("une validation");
    expect(mail.text).toContain("https://console.test/atelier/approvals");
    expect(mail.text).toContain("Atelier Lumière");
  });

  test("labels every intervention type", () => {
    for (const type of ["approval", "clarification", "sudo", "secret", "launch_review", "deliverable_review"] as const) {
      const mail = interventionEmail({ tenantName: "T", type, url: "https://x/y" });
      expect(mail.subject).not.toContain("undefined");
      expect(mail.subject.length).toBeGreaterThan(10);
    }
  });
});
