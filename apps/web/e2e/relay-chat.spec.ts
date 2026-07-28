import { expect, test } from "@playwright/test";
import { installHermesMock, loginE2E } from "./hermes-mock";

test("streams a browser chat through an enrolled Relay WebSocket URL", async ({ page }) => {
  const calls = await installHermesMock(page, {
    gatewayUrl: "wss://relay.example.test/v1/relay/installations/installation-a/v1/ws",
  });
  await loginE2E(page);
  await page.goto("/e2e/d/chat");
  const input = page.locator(".aui-composer-input [contenteditable=true]");
  await input.fill("message via relay");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => calls.some((call) => call.method === "prompt.submit" && call.params.text === "message via relay")).toBe(true);
  await expect(page.getByText("Réponse Hermes simulée.")).toBeVisible();
});
