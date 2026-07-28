import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

describe("Telegram intervention push", () => {
  test("escapes HTML-sensitive characters", async () => {
    const { escapeTelegramHtml } = await import("./telegram");
    expect(escapeTelegramHtml("<b>A & B</b>")).toBe("&lt;b&gt;A &amp; B&lt;/b&gt;");
  });

  test("isPublicButtonUrl rejects localhost / loopback / non-http urls", async () => {
    const { isPublicButtonUrl } = await import("./telegram");
    expect(isPublicButtonUrl("https://console.example.com/x/approvals")).toBe(true);
    expect(isPublicButtonUrl("http://localhost:3010/x/approvals")).toBe(false);
    expect(isPublicButtonUrl("http://127.0.0.1:3010/x")).toBe(false);
    expect(isPublicButtonUrl("ftp://example.com")).toBe(false);
    expect(isPublicButtonUrl("pas une url")).toBe(false);
  });

  test("sendTelegramMessage is a no-op when no bot token is configured", async () => {
    const { sendTelegramMessage, telegramConfigured } = await import("./telegram");
    const environment = process.env as Record<string, string | undefined>;
    const previous = environment.TELEGRAM_BOT_TOKEN;
    const previousOverrides = environment.HERMES_SETTINGS_DISABLE_OVERRIDES;
    delete environment.TELEGRAM_BOT_TOKEN;
    // Épingle la résolution sur l'environnement : ce test porte sur l'absence de
    // jeton, pas sur la table de réglages, et sans cela il exigerait une base.
    environment.HERMES_SETTINGS_DISABLE_OVERRIDES = "true";
    try {
      // Asynchrone depuis que le jeton peut être surchargé depuis la Console.
      expect(await telegramConfigured()).toBe(false);
      await expect(sendTelegramMessage({ text: "test" })).resolves.toBeUndefined();
    } finally {
      if (previous !== undefined) environment.TELEGRAM_BOT_TOKEN = previous;
      if (previousOverrides === undefined) delete environment.HERMES_SETTINGS_DISABLE_OVERRIDES;
      else environment.HERMES_SETTINGS_DISABLE_OVERRIDES = previousOverrides;
    }
  });

  test("interventionTelegram builds a push with tenant, reason and a console button", async () => {
    const { interventionTelegram } = await import(
      "@/modules/work/infrastructure/intervention-notification"
    );
    const push = interventionTelegram({
      tenantName: "Atelier Lumière",
      type: "secret",
      url: "https://console.hermes.local/atelier-lumiere/approvals",
    });
    expect(push.text).toContain("Atelier Lumière");
    expect(push.text).toContain("un secret");
    expect(push.buttons).toEqual([
      { text: "Ouvrir la Console", url: "https://console.hermes.local/atelier-lumiere/approvals" },
    ]);
  });
});
