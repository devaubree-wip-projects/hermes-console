/**
 * Dev preview: pushes sample intervention alerts to Telegram so you can see
 * them on your phone. Requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in the env.
 *
 *   1. Create a bot with @BotFather -> copy the token.
 *   2. Get your chat id (message @userinfobot, or read getUpdates).
 *   3. Add TELEGRAM_BOT_TOKEN=... and TELEGRAM_CHAT_ID=... to ../../.env
 *   4. bun --env-file=../../.env run scripts/preview-telegram-intervention.ts
 */
import { interventionTelegram } from "@/modules/work/infrastructure/intervention-notification";
import { sendTelegramMessage, telegramConfigured } from "@/lib/telegram";
import { consoleBaseUrl } from "@/lib/console-url";
import type { WorkInterventionType } from "@/db/schema";

if (!telegramConfigured()) {
  console.log(
    "TELEGRAM_BOT_TOKEN absent. Ajoute TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID au .env, puis relance.",
  );
  process.exit(0);
}

const types: WorkInterventionType[] = ["approval", "secret", "deliverable_review"];
for (const type of types) {
  const push = interventionTelegram({
    tenantName: "Atelier Lumière",
    type,
    url: `${consoleBaseUrl()}/e2e/approvals`,
  });
  await sendTelegramMessage({ text: push.text, buttons: push.buttons });
  console.log(`envoyé: ${type}`);
}
console.log("\nRegarde ton Telegram 📲");
