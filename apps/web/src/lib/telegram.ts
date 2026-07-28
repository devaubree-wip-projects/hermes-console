import { settingValue } from "@/lib/settings/resolve";
/**
 * Minimal Console -> Telegram Bot API sender (native fetch, no dependency).
 * Best-effort, like the mailer: a no-op when TELEGRAM_BOT_TOKEN is unset, so
 * notifications never fail the runtime. Productionising this means per-tenant
 * chat bindings instead of the single dev TELEGRAM_CHAT_ID.
 */

export type TelegramButton = { text: string; url: string };

export type TelegramMessage = {
  /** Overrides the default TELEGRAM_CHAT_ID. */
  chatId?: string;
  /** HTML-formatted (parse_mode=HTML); escape any user content first. */
  text: string;
  buttons?: TelegramButton[];
};

export async function telegramConfigured(): Promise<boolean> {
  return Boolean((await settingValue("TELEGRAM_BOT_TOKEN"))?.trim());
}

/**
 * Telegram rejects inline URL buttons pointing at localhost / loopback IPs
 * (and a phone can't reach a dev machine's localhost anyway). Drop them so the
 * text alert still goes through instead of failing the whole send with a 400.
 */
export function isPublicButtonUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "0.0.0.0";
  } catch {
    return false;
  }
}

/** Escape user content for Telegram HTML parse mode. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(message: TelegramMessage): Promise<void> {
  const token = (await settingValue("TELEGRAM_BOT_TOKEN"))?.trim();
  // La cible explicite du message prime toujours sur le réglage d'instance : elle
  // vient d'un rattachement stocké, donc d'un choix plus précis.
  const chatId = message.chatId?.trim() || (await settingValue("TELEGRAM_CHAT_ID"))?.trim();
  if (!token || !chatId) return;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  const buttons = (message.buttons ?? []).filter((button) => isPublicButtonUrl(button.url));
  if (buttons.length) {
    body.reply_markup = {
      inline_keyboard: [buttons.map((button) => ({ text: button.text, url: button.url }))],
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage a échoué (${response.status}).`);
  }
}
