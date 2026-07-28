/**
 * Dev preview: renders the Apple email template for each intervention type and
 * sends them to the local mail catcher (Mailpit UI on http://localhost:8025).
 *
 *   bun --env-file=../../.env run scripts/preview-apple-email.ts
 */
import { interventionEmail } from "@/modules/work/infrastructure/intervention-notification";
import { sendMail } from "@/lib/mailer";
import type { WorkInterventionType } from "@/db/schema";

const types: WorkInterventionType[] = [
  "approval",
  "secret",
  "sudo",
  "clarification",
  "launch_review",
  "deliverable_review",
];

for (const type of types) {
  const { subject, text, html } = interventionEmail({
    tenantName: "Atelier Lumière",
    type,
    url: "https://console.hermes.local/atelier-lumiere/approvals",
  });
  await sendMail({ to: "preview@hermes.local", subject, text, html });
  console.log(`envoyé: ${type} — ${subject}`);
}
console.log("\nOuvre Mailpit: http://localhost:8025");
