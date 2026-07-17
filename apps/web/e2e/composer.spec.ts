import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installHermesMock, loginE2E, type RpcCall } from "./hermes-mock";

const chatUrl = "/e2e/d/chat";

async function openComposer(page: Page) {
  const calls = await installHermesMock(page);
  await loginE2E(page);
  await page.goto(chatUrl);
  await expect(page.locator(".aui-lexical-placeholder")).toHaveText("Ask anything, @ to add files, / for commands");
  await expect(page.locator(".aui-composer-input [contenteditable=true]")).toBeVisible();
  await expect.poll(() => calls.some((call) => call.method === "model.options")).toBe(true);
  return calls;
}

async function typeMessage(page: Page, text: string) {
  const input = page.locator(".aui-composer-input [contenteditable=true]");
  await input.click();
  await input.fill(text);
}

function lastCall(calls: RpcCall[], method: string) {
  return calls.filter((call) => call.method === method).at(-1);
}

test("matches the HonoUI composer structure across responsive widths", async ({ page }) => {
  await openComposer(page);
  const shell = page.locator('[data-slot="aui_composer-shell"]');
  await expect(shell).toHaveClass(/rounded-lg/);
  await expect(page.getByRole("button", { name: "Add context or change mode" })).toHaveCSS("cursor", "pointer");
  await expect(page.getByRole("button", { name: "Select model" })).toContainText("claude haiku 4 5");
  await expect(page.getByRole("button", { name: "Select effort" })).toContainText(/medium/i);
  await page.getByRole("button", { name: "Select model" }).click();
  await expect(page.getByText("anthropic", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "claude-opus-4-6", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "gpt-5.5", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(shell).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const box = await shell.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(Math.min(736, viewport.width - 32));
  }
});

test("explains and completes the real Telegram handoff in a responsive 75% dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await openComposer(page);

  await page.getByRole("button", { name: "Comprendre le transfert vers Telegram" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Continuer cette session sur Telegram" })).toBeVisible();
  await expect(dialog.getByText("Même session, nouveau canal")).toBeVisible();
  await expect(dialog.getByText("De la Console au gateway Telegram")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Un bot, plusieurs sessions" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(accessibility.violations).toEqual([]);

  const desktopViewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return (box?.width ?? 0) / desktopViewport.width;
  }).toBeCloseTo(0.75, 2);
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return (box?.height ?? 0) / desktopViewport.height;
  }).toBeCloseTo(0.75, 2);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(390);
  const mobileBox = await dialog.boundingBox();
  expect(mobileBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await dialog.getByRole("button", { name: "Continuer sur Telegram" }).click();
  await expect(dialog.getByText("Transfert terminé", { exact: true }).first()).toBeVisible();
  await expect.poll(() => lastCall(calls, "handoff.request")?.params).toMatchObject({
    session_id: "live-e2e",
    platform: "telegram",
  });
  expect(calls.some((call) => call.method === "session.create")).toBe(true);
  expect(calls.filter((call) => call.method === "handoff.state").length).toBeGreaterThanOrEqual(2);
  expect(calls.some((call) => call.method === "slash.exec" && String(call.params.command).includes("handoff"))).toBe(false);
});

test("creates an isolated agent from /agent-create without opening a Hermes session", async ({ page }) => {
  const calls = await openComposer(page);
  let createPayload: Record<string, unknown> | null = null;
  await page.route("**/api/e2e/agents", async (route) => {
    createPayload = await route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        agent: { id: "agent-seo-e2e", name: createPayload.name },
        redirectTo: chatUrl,
      }),
    });
  });

  await typeMessage(page, "/agent");
  await expect(page.getByText("Créer un agent : /agent-create :mission")).toBeVisible();
  await page.getByText("/agent-create", { exact: true }).click();
  const commandBadge = page.locator('[data-slot="aui-command-badge"]');
  await expect(commandBadge).toContainText("/agent-create");
  await expect(page.locator(".aui-composer-input .aui-directive-chip")).toHaveCount(0);

  const composerInput = page.locator(".aui-composer-input [contenteditable=true]");
  await composerInput.pressSequentially(" mission conservée");
  await commandBadge.getByRole("button", { name: "Retirer /agent-create" }).click();
  await expect(commandBadge).toHaveCount(0);
  await expect(composerInput).toHaveText("mission conservée");

  await typeMessage(page, "/agent");
  await page.getByText("/agent-create", { exact: true }).click();
  await composerInput.pressSequentially(
    " :Crée un agent qui analyse le SEO technique et prépare les priorités",
  );
  await page.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => createPayload).toMatchObject({
    name: "Analyse le SEO technique et prépare les priorités",
    description: "Crée un agent qui analyse le SEO technique et prépare les priorités",
  });
  await expect(page.getByText("Agent créé")).toBeVisible();
  expect(calls.some((call) => call.method === "session.create")).toBe(false);
  expect(calls.some((call) => call.method === "slash.exec")).toBe(false);
});

test("keeps an existing thread composer docked while delayed history loads", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installHermesMock(page, { sessionsDelayMs: 1_000, historyDelayMs: 1_000 });
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/tools-history-e2e`);

  const composer = page.locator(".aui-composer-root");
  const viewport = page.locator('[data-slot="aui_thread-viewport"]');
  await expect(composer).toBeVisible();
  await expect(page.getByText("How can I help you today?", { exact: true })).toHaveCount(0);
  await expect(page.locator(".aui-thread-welcome-suggestions-shell")).toHaveCount(0);

  const loadingBox = await composer.boundingBox();
  expect(loadingBox).not.toBeNull();
  expect(900 - (loadingBox!.y + loadingBox!.height)).toBeLessThanOrEqual(24);

  await expect(page.getByText("Réponse historique.")).toBeVisible();
  const loadedBox = await composer.boundingBox();
  expect(loadedBox).not.toBeNull();
  expect(Math.abs(loadedBox!.y - loadingBox!.y)).toBeLessThanOrEqual(2);

  await expect.poll(async () => viewport.evaluate((element) => (
    Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight)
  ))).toBeLessThanOrEqual(2);
});

test("keeps the welcome composer centered on a new conversation", async ({ page }) => {
  await installHermesMock(page, { sessionsDelayMs: 1_000 });
  await loginE2E(page);
  await page.goto(chatUrl);

  await expect(page.getByText("How can I help you today?", { exact: true })).toBeVisible();
  await expect(page.locator(".aui-thread-welcome-suggestions-shell")).toBeVisible();
  await expect(page.locator('[data-slot="aui_thread-viewport"]')).toHaveClass(/justify-center/);
  await expect(page.locator(".aui-thread-viewport-footer")).not.toHaveClass(/sticky/);
});

test("sends selected model, effort and speed in the first session.create", async ({ page }) => {
  const calls = await openComposer(page);

  await page.getByRole("button", { name: "Select model" }).click();
  await page.getByRole("button", { name: /claude-opus-4-6/i }).click();
  await expect(page.getByRole("button", { name: "Select model" })).toContainText("claude opus 4 6");
  await expect.poll(() => lastCall(calls, "inference.update")?.params).toMatchObject({
    mode: "model",
    provider: "anthropic",
    model: "claude-opus-4-6",
  });
  await expect(page.getByText("Modèle enregistré", { exact: true })).toBeVisible();
  await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("data-y-position", "top");
  await page.getByRole("button", { name: "Select effort" }).click();
  await expect(page.getByRole("button", { name: /^Extra high/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Max/ }).click();
  await page.getByRole("button", { name: "Add context or change mode" }).click();
  const speedMenu = page.getByRole("button", { name: "Speed", exact: true });
  await expect(speedMenu).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Fast", exact: true })).toBeHidden();
  await speedMenu.hover();
  await page.getByRole("menuitemradio", { name: "Fast", exact: true }).click();

  expect(calls.some((call) => call.method === "config.set")).toBe(false);
  await typeMessage(page, "Premier message");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => lastCall(calls, "session.create")?.params).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-4-6",
    reasoning_effort: "max",
    fast: true,
  });
  await expect.poll(() => lastCall(calls, "inference.update")?.params).toMatchObject({
    mode: "reasoning",
    reasoningEffort: "max",
  });
  await expect(page.getByText("Réponse Hermes simulée.")).toBeVisible();
});

test("saves an existing thread model through the same inference path as Settings", async ({ page }) => {
  const calls = await installHermesMock(page);
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);

  await expect(page.getByRole("button", { name: "Select model" })).toContainText("gpt 5.5");
  await page.getByRole("button", { name: "Select model" }).click();
  await page.getByRole("button", { name: "gpt-5.3-codex", exact: true }).click();

  await expect.poll(() => lastCall(calls, "inference.update")?.params).toMatchObject({
    mode: "model",
    provider: "openai-codex",
    model: "gpt-5.3-codex",
  });
  await expect(page.getByText("Modèle enregistré", { exact: true })).toBeVisible();
  await expect(page.getByText(
    "gpt-5.3-codex sera utilisé par les prochaines sessions de cet agent.",
    { exact: true },
  )).toBeVisible();
  expect(calls.some((call) => call.method === "config.set" && call.params.key === "model"))
    .toBe(false);
});

test("revalidates the saved model immediately when returning to chat without a hard refresh", async ({ page }) => {
  const calls = await openComposer(page);
  const initialReads = calls.filter((call) => call.method === "inference.get").length;

  const responseStatus = await page.evaluate(async () => {
    const response = await fetch("/api/e2e/agents/assistant-principal/inference", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "model",
        provider: "openai-codex",
        model: "gpt-5.5",
        reasoningEffort: "high",
      }),
    });
    return response.status;
  });
  expect(responseStatus).toBe(200);

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("link", { name: "Sessions", exact: true }).click();

  await expect.poll(
    () => calls.filter((call) => call.method === "inference.get").length,
    { timeout: 1_500 },
  ).toBeGreaterThan(initialReads);
  await expect(page.getByRole("button", { name: "Select model" }))
    .toContainText("gpt 5.5");
});

test("uses native Hermes plan mode and the web-search turn instruction", async ({ page }) => {
  const calls = await openComposer(page);
  await page.getByRole("button", { name: "Add context or change mode" }).click();
  const planModeSwitch = page.getByRole("switch", { name: "Plan mode" });
  await expect(planModeSwitch).not.toBeChecked();
  await planModeSwitch.click({ force: true });
  await expect(planModeSwitch).toBeChecked();
  await expect(page.locator(".aui-composer-root")).toHaveAttribute("data-plan-mode", "true");
  const webSearchSwitch = page.getByRole("switch", { name: "Recherche web" });
  await expect(webSearchSwitch).toBeVisible();
  await expect(webSearchSwitch).not.toBeChecked();
  await webSearchSwitch.click({ force: true });
  await expect(webSearchSwitch).toBeChecked();
  await expect(page.locator('[data-slot="aui-web-search-badge"]')).toHaveText("Recherche web");

  await typeMessage(page, "Prépare la migration");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => lastCall(calls, "command.dispatch")?.params).toMatchObject({
    name: "plan",
    arg: "Prépare la migration",
  });
  await expect.poll(() => String(lastCall(calls, "prompt.submit")?.params.text)).toContain("[native-plan]");
  expect(String(lastCall(calls, "prompt.submit")?.params.text)).toContain("web_search");
});

test("uploads image, PDF and file attachments before submitting", async ({ page }) => {
  const calls = await openComposer(page);
  await page.getByRole("button", { name: "Add context or change mode" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([
    { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("png") },
    { name: "brief.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") },
  ]);
  await expect(page.locator(".aui-composer-attachments .aui-attachment-root")).toHaveCount(3);
  await typeMessage(page, "Analyse ces fichiers");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => calls.map((call) => call.method)).toEqual(expect.arrayContaining([
    "image.attach_bytes",
    "pdf.attach",
    "file.attach",
    "prompt.submit",
  ]));
  expect(calls.findIndex((call) => call.method === "file.attach"))
    .toBeLessThan(calls.findIndex((call) => call.method === "prompt.submit"));
});

test("loads Hermes @ and slash completions", async ({ page }) => {
  const calls = await openComposer(page);
  await typeMessage(page, "@fi");
  await expect.poll(() => calls.some((call) => call.method === "complete.path")).toBe(true);
  await expect(page.getByText("@file:apps/web/src/app/page.tsx")).toBeVisible();

  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("/pl");
  await expect.poll(() => calls.some((call) => call.method === "complete.slash")).toBe(true);
  await expect(page.getByText("Create an implementation plan")).toBeVisible();
});

test("updates active-session effort and permissions through config.set", async ({ page }) => {
  const calls = await openComposer(page);
  await typeMessage(page, "Initialise la session");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => calls.some((call) => call.method === "prompt.submit")).toBe(true);

  await page.getByRole("button", { name: "Select effort" }).click();
  await page.getByRole("button", { name: /^Low/ }).click();
  await page.getByRole("button", { name: "Select permissions" }).click();
  await page.getByRole("button", { name: "manual", exact: true }).click();

  await expect.poll(() => calls.filter((call) => call.method === "config.set").map((call) => call.params.key))
    .toEqual(expect.arrayContaining(["reasoning", "yolo", "approval_mode"]));
});

test("hides and omits effort for a model without configurable reasoning", async ({ page }) => {
  const calls = await openComposer(page);

  await page.getByRole("button", { name: "Select model" }).click();
  await page.getByRole("button", { name: "claude-haiku-4-5-no-thinking", exact: true }).click();
  await expect(page.getByRole("button", { name: "Select effort" })).toHaveCount(0);

  await typeMessage(page, "Réponse directe");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => lastCall(calls, "session.create")).toBeTruthy();
  expect(lastCall(calls, "session.create")?.params).not.toHaveProperty("reasoning_effort");
});

test("edits a user turn from the action bar", async ({ page }) => {
  const calls = await openComposer(page);
  await typeMessage(page, "message initial");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Réponse Hermes simulée.")).toBeVisible();

  const userMessage = page.locator('[data-slot="aui_user-message-root"]');
  await userMessage.hover();
  await userMessage.locator('button[aria-label="Edit"]').click();
  const input = page.locator(".aui-edit-composer-input [contenteditable=true]");
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("edited prompt");
  await page.getByRole("button", { name: "Update" }).click();

  await expect.poll(() => calls.filter((call) => call.method === "prompt.submit").length).toBe(2);
  expect(lastCall(calls, "prompt.submit")?.params).toMatchObject({
    text: "edited prompt",
  });
  await expect(page.getByText("edited prompt")).toBeVisible();
  await expect(page.getByText("Réponse Hermes éditée.")).toBeVisible();
  await expect(
    page.locator('[data-slot="aui_user-message-content"]').getByText("message initial"),
  ).toHaveCount(0);
});

test("reloads the assistant turn from the action bar", async ({ page }) => {
  const calls = await openComposer(page);
  await typeMessage(page, "refresh test");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Réponse Hermes simulée.")).toBeVisible();

  await page
    .locator('[data-slot="aui_assistant-message-root"] button[aria-label="Refresh"]')
    .click();
  await expect.poll(() => calls.filter((call) => call.method === "prompt.submit").length).toBe(2);
  expect(String(lastCall(calls, "prompt.submit")?.params.text)).toContain("refresh test");
  await expect(page.getByText("Réponse Hermes régénérée.")).toBeVisible();
});

test("streams reasoning before assistant text", async ({ page }) => {
  await openComposer(page);
  await typeMessage(page, "reasoning stream");
  await page.getByRole("button", { name: "Send message" }).click();

  const reasoningTrigger = page.locator("[data-slot=reasoning-trigger]");
  await expect(reasoningTrigger).toBeVisible();
  await reasoningTrigger.click();
  await expect(page.getByText("Je réfléchis à la réponse.")).toBeVisible();
  await expect(page.locator("[data-slot=aui_assistant-run-indicator]")).toHaveCount(0);
  await expect(page.getByText("Réponse Hermes simulée.")).toBeVisible();
});

test("cancels a running Hermes turn and exposes real context usage", async ({ page }) => {
  const calls = await openComposer(page);
  await typeMessage(page, "slow response");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: /Context usage 9.8%/ })).toHaveAttribute("data-used-tokens", "12500");
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
  await page.getByRole("button", { name: "Stop generating" }).click();
  await expect.poll(() => calls.some((call) => call.method === "session.interrupt")).toBe(true);
});

test("returns to the base chat URL when creating a new session", async ({ page }) => {
  await openComposer(page);
  await typeMessage(page, "Crée une session");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page).toHaveURL(/\/d\/chat\/c\/session-e2e$/);
  await expect(page.getByRole("button", { name: "Select model" })).toContainText("gpt 5.5");
  await page.getByRole("button", { name: /nouvelle session/i }).first().click();
  await expect(page).toHaveURL(/\/e2e\/d\/chat$/);
  await expect(page.getByRole("button", { name: "Select model" })).toContainText("claude haiku 4 5");
  await expect(page.getByRole("button", { name: "Select effort" })).toContainText(/medium/i);
});

test("groups persisted tool history into collapsible tool-name groups", async ({ page }) => {
  await installHermesMock(page);
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/tools-history-e2e`);

  const skillGroup = page.locator("[data-slot=tool-group-trigger]", { hasText: "skill_view" });
  await expect(skillGroup).toBeVisible();
  await expect(skillGroup).toContainText("2");
  await expect(page.getByText("Outil exécuté")).toHaveCount(0);
  await expect(page.getByText("Réponse historique.")).toBeVisible();

  await skillGroup.click();
  await expect(page.getByText("automate — Create Cursor Automations.")).toBeVisible();
  await expect(page.getByText("canvas — Live React canvas beside chat.")).toBeVisible();

  await page.locator("[data-slot=tool-call-detail]").first().click();
  await expect(page.getByText("Skill content for automate.")).toBeVisible();
});

test("marks the active conversation with a persistent sidebar background", async ({ page }) => {
  await installHermesMock(page);
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/tools-history-e2e`);

  const activeItem = page.locator(".aui-thread-list-item[data-active]");
  const inactiveItem = page.locator(".aui-thread-list-item:not([data-active])").first();
  await expect(activeItem).toBeVisible();
  await expect(activeItem.locator(".aui-thread-list-item-trigger")).toHaveAttribute("aria-current", "page");
  await expect(inactiveItem).toBeVisible();

  const [activeBackground, inactiveBackground] = await Promise.all([
    activeItem.evaluate((element) => getComputedStyle(element).backgroundColor),
    inactiveItem.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(activeBackground).not.toBe(inactiveBackground);
});

test("uses the resumed session provider instead of the Settings default", async ({ page }) => {
  await installHermesMock(page);
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);

  await expect(page.getByRole("button", { name: "Select model" })).toContainText("gpt 5.5");
  await page.getByRole("button", { name: "Select model" }).click();
  await expect(page.getByText("openai codex", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "gpt-5.5", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "claude-opus-4-6", exact: true })).toHaveCount(0);
});

test("shows exact session usage in the sidebar", async ({ page }) => {
  await installHermesMock(page);
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);

  const card = page.getByRole("region", { name: "Utilisation de la session active" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("TELEGRAM");
  await expect(card).toContainText(/420[\s\u202f]194/);
  await expect(card).toContainText(/12[\s\u202f]500 \/ 128[\s\u202f]000/);
  await expect(card).toContainText(/115[\s\u202f]500 restants/);
  await expect(card).toContainText("gpt 5.5");
  await expect(card).toContainText("Raisonnement High");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  await expect(page.getByText("Smarter queue triage")).toHaveCount(0);
});

test("labels the local context estimate when the provider measurement is unavailable", async ({ page }) => {
  await installHermesMock(page, { liveContext: false, persistedContext: false });
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);

  const card = page.getByRole("region", { name: "Utilisation de la session active" });
  await expect(card).toContainText(/33[\s\u202f]700 \/ 128[\s\u202f]000 estimés/);
  await expect(card).toContainText(/94[\s\u202f]300 restants · 26,3 % estimé/);
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "26");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuetext", /estimation locale/);
});

test("keeps context pending when neither a provider measure nor an estimate exists", async ({ page }) => {
  await installHermesMock(page, {
    liveContext: false,
    persistedContext: false,
    estimatedContext: false,
  });
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);

  const card = page.getByRole("region", { name: "Utilisation de la session active" });
  await expect(card).toContainText("En attente d’une mesure provider");
  await expect(card.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
});

test("uses the validated Telegram context in the composer indicator", async ({ page }) => {
  await installHermesMock(page, { liveContext: false });
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);

  const indicator = page.getByRole("button", { name: /Context usage 26%/ });
  await expect(indicator).toHaveAttribute("data-used-tokens", "70587");
  await expect(indicator).toHaveAttribute("data-context-window", "272000");
  await indicator.hover();
  await expect(page.getByRole("tooltip")).toHaveText("26 % utilisé");
});

test("deletes the active session without resuming the deleted Hermes id", async ({ page }) => {
  const calls = await installHermesMock(page);
  await loginE2E(page);
  await page.goto(`${chatUrl}/c/history-e2e`);
  await expect(page.getByText("Session à supprimer").first()).toBeVisible();
  await expect.poll(() => calls.filter((call) => call.method === "session.resume").length).toBe(1);

  const activeItem = page.locator(".aui-thread-list-item[data-active]");
  await activeItem.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();

  await expect(page).toHaveURL(/\/e2e\/d\/chat$/);
  await expect.poll(() => calls.some((call) => call.method === "sessions.delete")).toBe(true);
  await expect(page.getByText("Session supprimée", { exact: true })).toBeVisible();
  await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("data-y-position", "top");
  await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("data-x-position", "center");
  await expect.poll(() => calls.filter((call) => call.method === "session.resume").length).toBe(1);
  await expect(page.getByText("Session Hermes inaccessible")).toHaveCount(0);
});

test("has no WCAG A/AA violation in the composer", async ({ page }) => {
  await openComposer(page);
  const results = await new AxeBuilder({ page })
    .include(".aui-composer-root")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
